import Dexie, { type Table } from "dexie";
import { createCatalogState, DEMO_RECORD_IDS, stripDemoTransactions } from "@/domain/seed";
import { newEntityId } from "@/domain/service";
import type { AppState, Role } from "@/domain/types";
import {
  EntityDb,
  EntityWriter,
  getMeta,
  loadFromEntityStores,
  migrateSnapshotToEntityStores,
  migrationComplete,
  repairOrderFromSnapshot,
  setMeta,
  type MigrationReport,
} from "./entity-store";

class LocalDb extends Dexie {
  snapshots!: Table<{ id: string; state: AppState; saved_at?: string }>;
  constructor() {
    super("vattavada-business-manager");
    this.version(1).stores({ snapshots: "id" });
    this.version(2).stores({ snapshots: "id,saved_at" });
  }
}

const db = typeof indexedDB === "undefined" ? null : new LocalDb();
const edb = typeof indexedDB === "undefined" ? null : new EntityDb();
const writer = edb ? new EntityWriter(edb) : null;
const RECOVERY_PREFIX = "recovery-";
const RECOVERY_LIMIT = 5;
const CHECKPOINT_INTERVAL_MS = 15 * 60_000;
/** While the rollback window is open, mirror state into the legacy `primary` snapshot this often. */
const LEGACY_MIRROR_INTERVAL_MS = 5 * 60_000;
const ROLLBACK_WINDOW_DAYS = 30;
const ENTITY_STORE_SWITCH = "vbm-entity-store";
let lastCheckpointAt = 0;
let lastMirrorAt = 0;
let legacyMirrorUntil: string | null = null;

type StorageMode = "legacy" | "entity";

/** Startup timing in the console when localStorage["vbm-timing"] = "1" (diagnostics only). */
function timing(label: string, started: number) {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem("vbm-timing") === "1") {
      console.info(`[vbm] ${label}: ${Math.round(performance.now() - started)} ms (t=${Math.round(performance.now())})`);
    }
  } catch {
    /* ignore */
  }
}
let mode: StorageMode = "legacy";

/** Device-level kill switch (Settings): "off" keeps using the legacy snapshot. */
export function entityStoreEnabled(): boolean {
  try {
    return typeof localStorage === "undefined" || localStorage.getItem(ENTITY_STORE_SWITCH) !== "off";
  } catch {
    return true;
  }
}

export function setEntityStoreEnabled(enabled: boolean) {
  try {
    if (enabled) localStorage.removeItem(ENTITY_STORE_SWITCH);
    else localStorage.setItem(ENTITY_STORE_SWITCH, "off");
  } catch {
    /* private mode: nothing to persist */
  }
}

export function storageMode(): StorageMode {
  return mode;
}

export function entityDb(): EntityDb | null {
  return mode === "entity" ? edb : null;
}

export type EntityStoreStatus = {
  mode: StorageMode;
  enabled: boolean;
  migration: { at: string; report?: MigrationReport; fresh?: boolean } | null;
  failed: { at: string; report: MigrationReport } | null;
  legacyMirrorUntil: string | null;
};

export async function entityStoreStatus(): Promise<EntityStoreStatus> {
  return {
    mode,
    enabled: entityStoreEnabled(),
    migration: edb ? ((await getMeta(edb, "migration_complete")) ?? null) : null,
    failed: edb ? ((await getMeta(edb, "migration_failed")) ?? null) : null,
    legacyMirrorUntil,
  };
}

/**
 * Startup load. First launch after the update copies the legacy snapshot into per-entity
 * stores (validated, resumable); the legacy snapshot is never cleared. If anything fails the
 * app keeps running on the legacy snapshot exactly as before.
 */
export async function loadState(): Promise<AppState | null> {
  if (!db) return null;
  if (edb && writer && entityStoreEnabled()) {
    try {
      const t0 = performance.now();
      if (await migrationComplete(edb)) {
        const state = await loadFromEntityStores(edb);
        if (!(await edb.sync_meta.get("order.products"))) {
          await repairOrderFromSnapshot(edb, state, (await db.snapshots.get("primary"))?.state);
        }
        timing("load entity stores", t0);
        legacyMirrorUntil = (await getMeta<string>(edb, "legacy_mirror_until")) ?? null;
        writer.prime(state);
        timing("prime change tracker", t0);
        mode = "entity";
        lastCheckpointAt = Date.now(); // first recovery point 15 min after start, not during startup
        lastMirrorAt = Date.now();
        const normalized = state.users.length || state.businesses.length ? normalizeState(state) : null;
        timing("normalize", t0);
        return normalized;
      }
      const row = await db.snapshots.get("primary");
      if (!row?.state) {
        // Brand-new device: nothing to migrate.
        await setMeta(edb, "migration_complete", { at: new Date().toISOString(), fresh: true });
        writer.prime({} as AppState);
        mode = "entity";
        return null;
      }
      timing("read legacy snapshot", t0);
      const report = await migrateSnapshotToEntityStores(edb, row.state);
      timing("migrate + validate", t0);
      if (report.ok) {
        legacyMirrorUntil = new Date(Date.now() + ROLLBACK_WINDOW_DAYS * 86_400_000).toISOString();
        await setMeta(edb, "legacy_mirror_until", legacyMirrorUntil);
        const state = await loadFromEntityStores(edb);
        writer.prime(state);
        mode = "entity";
        lastCheckpointAt = Date.now();
        lastMirrorAt = Date.now(); // the legacy snapshot is identical right after migrating
        timing("first launch total", t0);
        return normalizeState(state);
      }
      console.warn("Entity store migration failed validation; staying on the legacy snapshot", report.errors);
    } catch (e) {
      console.warn("Entity store unavailable; staying on the legacy snapshot", e);
    }
  }
  mode = "legacy";
  const row = await db.snapshots.get("primary");
  return row?.state ? normalizeState(row.state) : null;
}

export function normalizeState(state: AppState): AppState {
  for (const o of state.orders) {
    o.guest_name ??= "";
    o.guest_phone ??= "";
    o.room_number ??= "";
  }
  const contacts: Record<string, { name: string; email: string; address: string; phone: string }> = {
    "biz-stay-a": {
      name: "G.V Royal Residency",
      email: "stay@royalresidency.local",
      address: "Koviloor Bus Stand, Munnar, Idukki, Kerala 685505",
      phone: "+91 86089 33892, +91 88382 67578",
    },
    "biz-stay-b": {
      name: "G.V Cloudy Glenn Resort",
      email: "stay@cloudyglenn.local",
      address: "Vattavada, Munnar, Idukki, Kerala 685505",
      phone: "+91 86089 33892, +91 88382 67578",
    },
    "biz-rest": {
      name: "G.V Cloudy Kitchen",
      email: "hello@cloudykitchen.local",
      address: "Urkadu, Vattavada, Munnar, Idukki, Kerala 685505",
      phone: "+91 93444 01050",
    },
  };
  for (const b of state.businesses) {
    const next = contacts[b.id];
    if (next) Object.assign(b, next);
  }
  for (const p of state.products) {
    p.description ??= "";
    p.image_url ??= "";
    p.tags ??= [];
    if (p.tags.includes("pos-adhoc") && !p.deleted_at) {
      p.deleted_at = new Date().toISOString();
    }
  }
  const seeded = createCatalogState(state.currentDeviceId);
  for (const cat of seeded.productCategories) {
    if (!state.productCategories.some((c) => c.id === cat.id)) state.productCategories.push(cat);
  }
  for (const p of seeded.products) {
    const existing = state.products.find((x) => x.id === p.id);
    if (!existing) state.products.push(p);
    else {
      if (!existing.description) existing.description = p.description;
      if (!existing.image_url) existing.image_url = p.image_url;
      if (!existing.tags?.length) existing.tags = [...p.tags];
    }
  }
  stripDemoTransactions(state);
  for (const c of state.dailyClosings) {
    c.status ??= "CLOSED";
    c.reopened_at ??= null;
    c.reopen_reason ??= "";
  }
  const known: Role[] = [
    "ADMIN",
    "MANAGER",
    "STAFF",
    "RESTAURANT_MANAGER",
    "RESTAURANT_STAFF",
    "STAY_MANAGER",
    "STAY_STAFF",
  ];
  for (const u of state.users) {
    if (!known.includes(u.role)) u.role = "STAFF";
  }
  const extraUsers = createCatalogState(state.currentDeviceId).users;
  for (const seeded of extraUsers) {
    const existing = state.users.find((x) => x.username === seeded.username);
    if (!existing) {
      state.users.push(seeded);
      continue;
    }
    existing.password_hash = seeded.password_hash;
    existing.password_salt = seeded.password_salt;
    existing.role = seeded.role;
    existing.active = seeded.active;
  }
  state.lastPulledAt ??= null;
  state.tax_enabled ??= true;
  remintDuplicateIds(state);
  return state;
}

const TRANSACTION_KEYS = [
  "customers",
  "orders",
  "orderItems",
  "bookings",
  "invoices",
  "invoiceItems",
  "payments",
  "expenses",
  "ledger",
  "products",
  "rooms",
  "dailyClosings",
] as const;

/** Keep unsynced local rows and any real rows the cloud does not have yet. Never restore demo ids. */
export function mergeLocalSafety(base: AppState, local: AppState) {
  base.syncQueue = local.syncQueue ?? [];
  base.currentUserId = local.currentUserId;
  if (typeof local.tax_enabled === "boolean") base.tax_enabled = local.tax_enabled;
  for (const key of TRANSACTION_KEYS) {
    const rows = local[key] as { id: string; sync_status?: string; updated_at?: string }[];
    const dest = base[key] as { id: string; sync_status?: string; updated_at?: string }[];
    for (const row of rows) {
      if (DEMO_RECORD_IDS.has(row.id)) continue;
      const idx = dest.findIndex((r) => r.id === row.id);
      if (idx < 0) {
        dest.push(row as never);
        continue;
      }
      if (row.sync_status === "PENDING") dest[idx] = row as never;
    }
  }
}

/** Old sequential ids (`rec-1-DEVICE-…`) collided after reload; keep one row per id. */
function remintDuplicateIds(state: AppState) {
  const device = state.currentDeviceId || "dev";
  keepNewestAndRemint(state.orders, "ord", device);
  keepNewestAndRemint(state.orderItems, "oi", device);
  keepNewestAndRemint(state.invoices, "inv", device);
  keepNewestAndRemint(state.invoiceItems, "ii", device);
  keepNewestAndRemint(state.payments, "pay", device);
  keepNewestAndRemint(state.customers, "cust", device);
  keepNewestAndRemint(state.bookings, "bk", device);
  keepNewestAndRemint(state.rooms, "rm", device);
}

function keepNewestAndRemint<T extends { id: string; updated_at?: string; created_at?: string }>(
  rows: T[],
  prefix: string,
  deviceId: string,
) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(row.id) ?? [];
    list.push(row);
    groups.set(row.id, list);
  }
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    const ranked = group.slice().sort((a, b) => {
      const ta = a.updated_at || a.created_at || "";
      const tb = b.updated_at || b.created_at || "";
      return tb.localeCompare(ta);
    });
    ranked.forEach((row, i) => {
      if (i === 0) return;
      row.id = newEntityId(prefix, deviceId);
    });
  }
}

export async function saveState(state: AppState): Promise<void> {
  if (!db) return;
  if (mode === "entity" && writer) {
    const t0 = performance.now();
    await writer.save(state);
    timing("incremental save", t0);
    await entityModeCheckpoints(state);
    return;
  }
  const now = Date.now();
  await db.transaction("rw", db.snapshots, async () => {
    if (now - lastCheckpointAt >= CHECKPOINT_INTERVAL_MS) {
      const current = await db.snapshots.get("primary");
      if (current?.state) {
        await db.snapshots.put({
          id: `${RECOVERY_PREFIX}${now}`,
          state: current.state,
          saved_at: new Date(now).toISOString(),
        });
        await trimRecoverySnapshots();
      }
      lastCheckpointAt = now;
    }
    await db.snapshots.put({ id: "primary", state, saved_at: new Date(now).toISOString() });
  });
}

/** Recovery points (every 15 min) and, during the rollback window, the legacy mirror. */
async function entityModeCheckpoints(state: AppState) {
  if (!db) return;
  const now = Date.now();
  const mirror =
    legacyMirrorUntil != null && now < Date.parse(legacyMirrorUntil) && now - lastMirrorAt >= LEGACY_MIRROR_INTERVAL_MS;
  const checkpoint = now - lastCheckpointAt >= CHECKPOINT_INTERVAL_MS;
  if (!mirror && !checkpoint) return;
  const copy = state; // put() structured-clones synchronously, so later in-place edits cannot leak in
  await db.transaction("rw", db.snapshots, async () => {
    if (checkpoint) {
      await db.snapshots.put({ id: `${RECOVERY_PREFIX}${now}`, state: copy, saved_at: new Date(now).toISOString() });
      await trimRecoverySnapshots();
      lastCheckpointAt = now;
    }
    if (mirror) {
      // Keeps the previous client usable if we roll back during the 30-day window.
      await db.snapshots.put({ id: "primary", state: copy, saved_at: new Date(now).toISOString() });
      lastMirrorAt = now;
    }
  });
}

async function trimRecoverySnapshots() {
  if (!db) return;
  const recoveries = (await db.snapshots.toArray())
    .filter((row) => row.id.startsWith(RECOVERY_PREFIX))
    .sort((a, b) => (b.saved_at ?? "").localeCompare(a.saved_at ?? ""));
  const stale = recoveries.slice(RECOVERY_LIMIT);
  if (stale.length) await db.snapshots.bulkDelete(stale.map((row) => row.id));
}

export type RecoverySnapshotSummary = {
  id: string;
  saved_at: string;
  invoices: number;
  orders: number;
  bookings: number;
};

export async function listRecoverySnapshots(): Promise<RecoverySnapshotSummary[]> {
  if (!db) return [];
  return (await db.snapshots.toArray())
    .filter((row) => row.id.startsWith(RECOVERY_PREFIX))
    .sort((a, b) => (b.saved_at ?? "").localeCompare(a.saved_at ?? ""))
    .map((row) => ({
      id: row.id,
      saved_at: row.saved_at ?? "",
      invoices: row.state.invoices.length,
      orders: row.state.orders.length,
      bookings: row.state.bookings.length,
    }));
}

export async function loadRecoverySnapshot(id: string): Promise<AppState | null> {
  if (!db || !id.startsWith(RECOVERY_PREFIX)) return null;
  const row = await db.snapshots.get(id);
  return row?.state ? normalizeState(row.state) : null;
}
