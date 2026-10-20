import { describe, expect, it } from "vitest";
import { createSeedState } from "./seed";
import { SEED_PASSWORDS } from "./seed-logins";
import { AppService, chunkSyncBatches, MemoryCursorAdapter, SYNC_BATCH_MAX_ITEMS } from "./service";
import { backupToJson, parseBackupJson } from "./backup";
import type { SyncQueueItem } from "./types";

function device(id: string, iso = "2026-08-21T10:00:00.000Z") {
  const s = new AppService(createSeedState(id), () => new Date(iso));
  s.login("admin", SEED_PASSWORDS.admin);
  return s;
}

function bill(s: AppService) {
  const order = s.startOrder({ business_id: "biz-rest" });
  s.addOrderItem(order.id, "p-tea", 2);
  return s.generateBill({
    orderId: order.id,
    payments: [{ method: "UPI", amount_paise: s.orderTotals(order.id).total_paise }],
  });
}

describe("Phase 4: batched, idempotent pushes", () => {
  it("sends at most 100 mutations per request and prunes acknowledged outbox rows", async () => {
    const s = device("dev-batch-aaaa");
    for (let i = 0; i < 250; i += 1) {
      s.createCustomer({ name: `Guest ${i}`, phone: `90000${String(i).padStart(5, "0")}` });
    }
    const cloud = new MemoryCursorAdapter();
    const before = s.pendingCount();
    expect(before).toBeGreaterThanOrEqual(250);
    const results = await s.processSyncQueue(cloud);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(cloud.requests).toBe(Math.ceil(before / SYNC_BATCH_MAX_ITEMS));
    expect(s.pendingCount()).toBe(0);
    expect(s.state.syncQueue).toHaveLength(0); // acknowledged rows deleted immediately
  });

  it("keeps failed rows with backoff and never duplicates on retry", async () => {
    let now = new Date("2026-08-21T10:00:00.000Z");
    const s = new AppService(createSeedState("dev-retry-aaaa"), () => now);
    s.login("admin", SEED_PASSWORDS.admin);
    const inv = bill(s);
    const cloud = new MemoryCursorAdapter();
    cloud.failNextBatch = true;
    const first = await s.processSyncQueue(cloud);
    expect(first.every((r) => !r.ok)).toBe(true);
    expect(s.syncIndicator().failed).toBeGreaterThan(0);
    expect(s.state.invoices.find((i) => i.id === inv.id)?.sync_status).toBe("FAILED");

    // inside the backoff window nothing is resent
    await s.processSyncQueue(cloud);
    expect(cloud.requests).toBe(1);

    now = new Date(now.getTime() + 15_000);
    const second = await s.processSyncQueue(cloud);
    expect(second.every((r) => r.ok)).toBe(true);
    expect(s.pendingCount()).toBe(0);
    expect([...cloud.rows.keys()].filter((k) => k === `invoice:${inv.id}`)).toHaveLength(1);
  });

  it("acknowledges a replayed mutation id without applying it twice", async () => {
    const s = device("dev-replay-aaa");
    s.createCustomer({ name: "Once", phone: "9111111111" });
    const item = { ...s.state.syncQueue[0] } as SyncQueueItem;
    const cloud = new MemoryCursorAdapter();
    await cloud.pushBatch([item]);
    const seqAfterFirst = cloud.seq;
    const replay = await cloud.pushBatch([item]);
    expect(replay[0].status).toBe("SYNCED");
    expect(cloud.seq).toBe(seqAfterFirst);
  });

  it("syncs ledger entries so the server can reconcile them", () => {
    const s = device("dev-ledger-aaa");
    bill(s);
    expect(s.state.syncQueue.some((q) => q.entity_type === "ledger")).toBe(true);
    expect(s.state.syncQueue.every((q) => q.mutation_id === q.id)).toBe(true);
  });

  it("splits batches by size as well as count, preserving order", () => {
    const big = "x".repeat(200 * 1024);
    const items = Array.from({ length: 5 }, (_, i) => ({ id: `q${i}`, entity_id: `e${i}`, payload: big }) as SyncQueueItem);
    const batches = chunkSyncBatches(items);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flat().map((i) => i.id)).toEqual(items.map((i) => i.id));
    for (const b of batches) expect(b.reduce((a, i) => a + i.payload.length, 0)).toBeLessThanOrEqual(512 * 1024);
  });
});

describe("Phase 4: cursor pulls", () => {
  it("pulls only rows after the stored cursor, page by page", async () => {
    const cloud = new MemoryCursorAdapter();
    cloud.pageSize = 3;
    const a = device("dev-cursor-aaa");
    const b = device("dev-cursor-bbb");
    const inv = bill(a);
    await a.processSyncQueue(cloud);

    const applied = await b.pullFromRemote(cloud);
    expect(applied).toBeGreaterThan(0);
    expect(b.state.invoices.some((i) => i.id === inv.id)).toBe(true);
    expect(b.state.ledger.some((l) => l.ref_id === inv.id)).toBe(true);
    expect(b.state.syncCursor).toBe(cloud.seq);

    const requestsBefore = cloud.requests;
    expect(await b.pullFromRemote(cloud)).toBe(0);
    expect(cloud.requests - requestsBefore).toBe(1); // one empty page, no full download

    a.updateProduct("p-parotta", { price_paise: 2500 });
    await a.processSyncQueue(cloud);
    await b.pullFromRemote(cloud);
    expect(b.state.products.find((p) => p.id === "p-parotta")?.price_paise).toBe(2500);
  });

  it("does an explicit snapshot resync when the server rejects the cursor", async () => {
    const cloud = new MemoryCursorAdapter();
    const a = device("dev-resync-aaa");
    const inv = bill(a);
    await a.processSyncQueue(cloud);
    const b = device("dev-resync-bbb");
    b.state.syncCursor = 10_000; // e.g. restored server database
    await b.pullFromRemote(cloud);
    expect(b.state.invoices.some((i) => i.id === inv.id)).toBe(true);
    expect(b.state.syncCursor).toBe(cloud.seq);
  });

  it("falls back to the legacy pull while the server has cursor reads disabled", async () => {
    const cloud = new MemoryCursorAdapter();
    cloud.cursorSupported = false;
    const a = device("dev-legacy-aaa");
    const inv = bill(a);
    await a.processSyncQueue(cloud);
    const b = device("dev-legacy-bbb");
    await b.pullFromRemote(cloud, { full: true });
    expect(b.state.invoices.some((i) => i.id === inv.id)).toBe(true);
    expect(b.state.syncCursor ?? null).toBeNull();
  });

  it("drops archived rows locally on PURGE but never a pending local edit", async () => {
    const cloud = new MemoryCursorAdapter();
    const a = device("dev-purge-aaaa");
    const inv = bill(a);
    await a.processSyncQueue(cloud);
    const b = device("dev-purge-bbbb");
    await b.pullFromRemote(cloud);
    expect(b.state.invoices.some((i) => i.id === inv.id)).toBe(true);

    const exp = b.createExpense({ business_id: "biz-rest", category: "Gas", amount_paise: 100, payment_method: "CASH", description: "", vendor: "" });
    cloud.purge("invoice", inv.id);
    cloud.purge("expense", exp.id);
    await b.pullFromRemote(cloud);
    expect(b.state.invoices.some((i) => i.id === inv.id)).toBe(false);
    expect(b.state.expenses.some((e) => e.id === exp.id)).toBe(true);
  });
});

describe("Phase 3: backup format v2", () => {
  it("exports normalized v2 and still imports v1", () => {
    const s = device("dev-backup-aaa");
    const inv = bill(s);
    const json = backupToJson(s.state);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(2);
    expect(parsed.entities.invoices.some((i: { id: string }) => i.id === inv.id)).toBe(true);
    const restored = parseBackupJson(json);
    expect(restored.invoices.find((i) => i.id === inv.id)?.total_paise).toBe(inv.total_paise);
    expect(restored.syncQueue.length).toBe(s.state.syncQueue.filter((q) => !q.synced_at).length);

    const v1 = JSON.stringify({ format: "vattavada-business-manager-backup", version: 1, exported_at: "x", state: s.state });
    expect(parseBackupJson(v1).invoices.some((i) => i.id === inv.id)).toBe(true);
  });

  it("rejects a truncated v2 backup", () => {
    const s = device("dev-backup-bbb");
    bill(s);
    const parsed = JSON.parse(backupToJson(s.state));
    parsed.entities.invoices = [];
    expect(() => parseBackupJson(JSON.stringify(parsed))).toThrow(/incomplete/);
  });
});
