import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSeedState } from "@/domain/seed";
import { SEED_PASSWORDS } from "@/domain/seed-logins";
import { AppService } from "@/domain/service";
import type { AppState } from "@/domain/types";
import {
  ENTITY_DB_NAME,
  EntityDb,
  EntityWriter,
  getMeta,
  loadFromEntityStores,
  migrateSnapshotToEntityStores,
  setMeta,
  validateAgainstSnapshot,
} from "./entity-store";
import { Repository } from "./repository";

const LEGACY_DB = "vattavada-business-manager";

function busyState(device = "dev-store-aaaa"): AppState {
  const s = new AppService(createSeedState(device), () => new Date("2026-08-21T10:00:00.000Z"));
  s.login("admin", SEED_PASSWORDS.admin);
  for (let i = 0; i < 20; i += 1) {
    const order = s.startOrder({ business_id: "biz-rest" });
    s.addOrderItem(order.id, "p-tea", 1 + (i % 3));
    s.generateBill({ orderId: order.id, payments: [{ method: "CASH", amount_paise: s.orderTotals(order.id).total_paise }] });
  }
  s.createExpense({ business_id: "biz-rest", category: "Gas", amount_paise: 15000, payment_method: "CASH", description: "" });
  return s.state;
}

function byId<T extends { id: string }>(rows: T[]) {
  return [...rows].sort((a, b) => a.id.localeCompare(b.id));
}

beforeEach(async () => {
  await Dexie.delete(ENTITY_DB_NAME);
  await Dexie.delete(LEGACY_DB);
  await Dexie.delete("test-entities");
});

describe("Phase 3: snapshot -> entity stores", () => {
  it("copies every array, validates counts/ids/totals/outbox, and marks complete", async () => {
    const db = new EntityDb("test-entities");
    const snapshot = busyState();
    const report = await migrateSnapshotToEntityStores(db, snapshot);
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.counts.invoices.stored).toBe(snapshot.invoices.length);
    expect(report.totals_paise.payments.snapshot).toBe(report.totals_paise.payments.stored);
    expect(await getMeta(db, "migration_complete")).toBeTruthy();

    const loaded = await loadFromEntityStores(db);
    expect(byId(loaded.invoices)).toEqual(byId(snapshot.invoices));
    expect(byId(loaded.ledger)).toEqual(byId(snapshot.ledger));
    expect(loaded.syncQueue.map((q) => q.id).sort()).toEqual(snapshot.syncQueue.map((q) => q.id).sort());
    const created = loaded.syncQueue.map((q) => q.created_at);
    expect(created).toEqual([...created].sort());
    expect(loaded.businesses).toEqual(snapshot.businesses);
    expect(loaded.tax_enabled).toBe(snapshot.tax_enabled);
  });

  it("keeps array order (POS menu follows KITCHEN_MENU order, not ids)", async () => {
    const db = new EntityDb("test-entities");
    const snapshot = busyState();
    const menuOrder = snapshot.products.map((p) => p.id);
    expect([...menuOrder].sort()).not.toEqual(menuOrder); // ids are not alphabetical
    await migrateSnapshotToEntityStores(db, snapshot);
    const loaded = await loadFromEntityStores(db);
    expect(loaded.products.map((p) => p.id)).toEqual(menuOrder);
    expect(loaded.invoices.map((i) => i.id)).toEqual(snapshot.invoices.map((i) => i.id));

    // order survives incremental saves, including a reorder and an appended row
    const writer = new EntityWriter(db);
    writer.prime(loaded);
    loaded.products.reverse();
    loaded.products.push({ ...loaded.products[0], id: "aaa-new-product" });
    await writer.save(loaded);
    const again = await loadFromEntityStores(db);
    expect(again.products.map((p) => p.id)).toEqual(loaded.products.map((p) => p.id));
  });

  it("detects a store that does not match the snapshot", async () => {
    const db = new EntityDb("test-entities");
    const snapshot = busyState();
    await migrateSnapshotToEntityStores(db, snapshot);
    await db.entity("payments").delete(snapshot.payments[0].id);
    const report = await validateAgainstSnapshot(db, snapshot, new Date().toISOString());
    expect(report.ok).toBe(false);
    expect(report.errors.join(" ")).toMatch(/payments/);
  });

  it("writes only changed rows and deletes removed rows", async () => {
    const db = new EntityDb("test-entities");
    const state = busyState();
    await migrateSnapshotToEntityStores(db, state);
    const writer = new EntityWriter(db);
    writer.prime(state);
    expect(await writer.save(state)).toEqual({ puts: 0, deletes: 0 });

    state.invoices[0].notes = "edited";
    const removed = state.expenses.pop()!;
    const res = await writer.save(state);
    expect(res).toEqual({ puts: 1, deletes: 1 });
    expect((await db.entity("invoices").get(state.invoices[0].id))?.notes).toBe("edited");
    expect(await db.entity("expenses").get(removed.id)).toBeUndefined();

    state.syncQueue = [];
    await writer.save(state);
    expect(await db.outbox.count()).toBe(0);
  });

  it("answers page queries from indexes", async () => {
    const db = new EntityDb("test-entities");
    const state = busyState();
    await migrateSnapshotToEntityStores(db, state);
    const repo = new Repository(db);
    const day = state.invoices[0].business_date;
    const invoices = await repo.invoicesByDate("biz-rest", day, day);
    expect(invoices.length).toBe(state.invoices.filter((i) => i.business_id === "biz-rest" && i.business_date === day && !i.deleted_at).length);
    const payments = await repo.paymentsByDate("biz-rest", day, day);
    expect(payments.reduce((a, p) => a + p.amount_paise, 0)).toBe(
      state.payments.filter((p) => p.business_date === day && p.business_id === "biz-rest").reduce((a, p) => a + p.amount_paise, 0),
    );
    expect((await repo.invoiceItems(state.invoices[0].id)).length).toBeGreaterThan(0);
  });
});

describe("Phase 3: first launch via loadState()", () => {
  async function expectedAfterNormalize(state: AppState) {
    const { normalizeState } = await import("./persist");
    return normalizeState(JSON.parse(JSON.stringify(state)) as AppState);
  }

  async function freshPersist() {
    vi.resetModules();
    return import("./persist");
  }

  async function writeLegacySnapshot(state: AppState) {
    const legacy = new Dexie(LEGACY_DB);
    legacy.version(1).stores({ snapshots: "id" });
    legacy.version(2).stores({ snapshots: "id,saved_at" });
    await legacy.open();
    await legacy.table("snapshots").put({ id: "primary", state, saved_at: "2026-08-21T10:00:00.000Z" });
    legacy.close();
  }

  async function readLegacySnapshot(): Promise<AppState | undefined> {
    const legacy = new Dexie(LEGACY_DB);
    legacy.version(2).stores({ snapshots: "id,saved_at" });
    await legacy.open();
    const row = await legacy.table("snapshots").get("primary");
    legacy.close();
    return row?.state;
  }

  it("migrates once, keeps the legacy snapshot untouched, and reloads from entity stores", async () => {
    const snapshot = busyState();
    await writeLegacySnapshot(snapshot);
    const expected = await expectedAfterNormalize(snapshot);
    const persist = await freshPersist();
    const loaded = await persist.loadState();
    expect(persist.storageMode()).toBe("entity");
    expect(loaded?.invoices.length).toBe(expected.invoices.length);
    expect(byId(loaded!.payments)).toEqual(byId(expected.payments));
    expect((await readLegacySnapshot())?.invoices.length).toBe(snapshot.invoices.length);

    // edits go to entity stores; the legacy snapshot is only mirrored on its slow cadence
    loaded!.invoices[0].notes = "after-migration";
    await persist.saveState(loaded!);
    const again = await (await freshPersist()).loadState();
    expect(again?.invoices.find((i) => i.id === loaded!.invoices[0].id)?.notes).toBe("after-migration");
    const status = await persist.entityStoreStatus();
    expect(status.legacyMirrorUntil).not.toBeNull();
  });

  it("repairs product order on devices migrated before order was stored", async () => {
    const snapshot = busyState();
    await writeLegacySnapshot(snapshot);
    const first = await freshPersist();
    await first.loadState();
    // simulate the earlier build: no stored order
    const db = new EntityDb();
    await db.sync_meta.where("key").startsWith("order.").delete();
    db.close();
    const expected = await expectedAfterNormalize(snapshot);
    const loaded = await (await freshPersist()).loadState();
    expect(loaded?.products.map((p) => p.id)).toEqual(expected.products.map((p) => p.id));
  });

  it("resumes an interrupted migration on the next launch", async () => {
    const snapshot = busyState();
    await writeLegacySnapshot(snapshot);
    // Simulate a browser closed mid-migration: started marker, partial data, no complete marker.
    const db = new EntityDb();
    await setMeta(db, "migration_started", { at: "2026-08-21T10:00:00.000Z" });
    await db.entity("invoices").put({ ...(snapshot.invoices[0] as unknown as { id: string }) });
    db.close();

    const expected = await expectedAfterNormalize(snapshot);
    const persist = await freshPersist();
    const loaded = await persist.loadState();
    expect(persist.storageMode()).toBe("entity");
    expect(loaded?.invoices.length).toBe(expected.invoices.length);
    expect(loaded?.payments.length).toBe(expected.payments.length);
  });

  it("starts empty on a brand-new device", async () => {
    const persist = await freshPersist();
    expect(await persist.loadState()).toBeNull();
    expect(persist.storageMode()).toBe("entity");
  });
});
