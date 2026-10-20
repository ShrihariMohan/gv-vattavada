import Dexie, { type Table } from "dexie";
import type { AppState, SyncQueueItem } from "@/domain/types";

/**
 * Per-entity IndexedDB stores (Phase 3).
 *
 * Lives in its OWN Dexie database so the legacy `vattavada-business-manager` database keeps its
 * version (2) and its `primary` snapshot untouched: the previous client can still open it if we
 * roll back, and nothing here ever clears it.
 */
export const ENTITY_DB_NAME = "vattavada-business-manager-entities";

/** Store name -> Dexie index spec. Indexes mirror the fields pages filter on. */
export const ENTITY_TABLES = {
  customers: "id, phone",
  products: "id, business_id",
  rooms: "id, business_id",
  tables: "id, business_id",
  bookings: "id, [business_id+check_in], room_id, customer_id, status",
  orders: "id, [business_id+status], [business_id+created_at], customer_id",
  orderItems: "id, order_id, product_id",
  invoices: "id, [business_id+business_date], order_id, booking_id, customer_id",
  invoiceItems: "id, invoice_id",
  payments: "id, [business_id+business_date], invoice_id, booking_id",
  expenses: "id, [business_id+business_date]",
  ledger: "id, [business_id+business_date], ref_id",
  dailyClosings: "id, [business_id+business_date]",
  shifts: "id, business_id",
  auditLogs: "id, entity_id",
  conflicts: "id, entity_id",
} as const;

export type EntityKey = keyof typeof ENTITY_TABLES;
export const ENTITY_KEYS = Object.keys(ENTITY_TABLES) as EntityKey[];

/** Small arrays kept as one row each in the `catalog` store. */
export const CATALOG_KEYS = [
  "businesses",
  "users",
  "devices",
  "roomTypes",
  "productCategories",
  "expenseCategories",
  "invoiceCounters",
] as const satisfies readonly (keyof AppState)[];

/** Scalars persisted in `sync_meta` (currentDeviceId/online are runtime values). */
const SCALAR_KEYS = ["lastSyncedAt", "lastPulledAt", "syncCursor", "currentUserId", "tax_enabled"] as const;

type Row = { id: string } & Record<string, unknown>;
type MetaRow = { key: string; value: unknown };

export type ArchiveManifestRow = {
  month: string;
  created_at: string;
  verified_at: string | null;
  purged_at: string | null;
  sha256: Record<string, string>;
  counts: Record<string, number>;
  totals_paise: Record<string, number>;
};

export class EntityDb extends Dexie {
  outbox!: Table<SyncQueueItem, string>;
  catalog!: Table<{ key: string; rows: unknown[] }, string>;
  sync_meta!: Table<MetaRow, string>;
  archive_manifests!: Table<ArchiveManifestRow, string>;

  constructor(name = ENTITY_DB_NAME) {
    super(name);
    this.version(1).stores({
      ...ENTITY_TABLES,
      outbox: "id, created_at, status, entity_type, entity_id",
      catalog: "key",
      sync_meta: "key",
      archive_manifests: "month",
    });
  }

  entity(key: EntityKey): Table<Row, string> {
    return this.table(key) as Table<Row, string>;
  }

  get allTables() {
    return [...ENTITY_KEYS.map((k) => this.table(k)), this.outbox, this.catalog, this.sync_meta];
  }
}

// ---------------------------------------------------------------------------
// Migration from the monolithic snapshot
// ---------------------------------------------------------------------------

export type MigrationReport = {
  ok: boolean;
  started_at: string;
  finished_at: string;
  counts: Record<string, { snapshot: number; stored: number; duplicates: number }>;
  totals_paise: Record<string, { snapshot: number; stored: number }>;
  pending_outbox: { snapshot: number; stored: number };
  errors: string[];
};

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const r of rows) map.set(r.id, r); // last occurrence wins, same as bulkPut
  return [...map.values()];
}

const TOTAL_FIELDS: Partial<Record<EntityKey, string>> = {
  invoices: "total_paise",
  payments: "amount_paise",
  expenses: "amount_paise",
  ledger: "amount_paise",
  bookings: "total_paise",
};

function sumField(rows: Record<string, unknown>[], field: string) {
  return rows.reduce((a, r) => a + (typeof r[field] === "number" ? (r[field] as number) : 0), 0);
}

/**
 * IndexedDB returns rows sorted by primary key, but the app relies on array order (e.g. the POS
 * menu follows KITCHEN_MENU order). The id order of every entity array is stored in sync_meta
 * and restored on load.
 */
const orderKey = (key: EntityKey) => `order.${key}`;

function idOrder(rows: Row[]): string[] {
  return rows.map((r) => r.id);
}

export function restoreOrder(rows: Row[], order: string[] | undefined): Row[] {
  if (!order?.length) return rows;
  const pos = new Map<string, number>();
  order.forEach((id, i) => {
    if (!pos.has(id)) pos.set(id, i);
  });
  const end = order.length;
  return rows
    .map((row, i) => ({ row, at: pos.get(row.id) ?? end + i }))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.row);
}

/**
 * One-time repair for devices migrated before array order was stored: take the order from the
 * legacy snapshot (never cleared) and save it. Returns true when something was repaired.
 */
export async function repairOrderFromSnapshot(db: EntityDb, state: AppState, legacy: AppState | null | undefined): Promise<boolean> {
  if (!legacy) return false;
  let repaired = false;
  for (const key of ENTITY_KEYS) {
    if (await db.sync_meta.get(orderKey(key))) continue;
    const reference = idOrder((legacy[key] ?? []) as unknown as Row[]);
    const reordered = restoreOrder((state[key] ?? []) as unknown as Row[], reference);
    (state as unknown as Record<string, unknown>)[key] = reordered;
    await db.sync_meta.put({ key: orderKey(key), value: idOrder(reordered) });
    repaired = true;
  }
  return repaired;
}

export async function getMeta<T>(db: EntityDb, key: string): Promise<T | undefined> {
  return (await db.sync_meta.get(key))?.value as T | undefined;
}

export async function setMeta(db: EntityDb, key: string, value: unknown) {
  await db.sync_meta.put({ key, value });
}

export async function migrationComplete(db: EntityDb): Promise<boolean> {
  return Boolean(await getMeta(db, "migration_complete"));
}

/**
 * Copy every array of the snapshot into the entity stores in ONE Dexie transaction, then
 * validate counts, ids, financial totals and pending outbox rows. `migration_complete` is set
 * only after validation passes. Re-running is safe: the copy clears and rewrites the new stores
 * (never the legacy snapshot), so an interrupted migration simply runs again on next launch.
 */
export async function migrateSnapshotToEntityStores(db: EntityDb, snapshot: AppState): Promise<MigrationReport> {
  const started_at = new Date().toISOString();
  await setMeta(db, "migration_started", { at: started_at });
  await db.transaction("rw", db.allTables, async () => {
    for (const key of ENTITY_KEYS) {
      await db.entity(key).clear();
      await db.entity(key).bulkPut((snapshot[key] ?? []) as unknown as Row[]);
    }
    await db.outbox.clear();
    await db.outbox.bulkPut((snapshot.syncQueue ?? []).filter((q) => !q.synced_at).map((q) => ({ ...q, mutation_id: q.mutation_id ?? q.id })));
    await db.catalog.clear();
    for (const key of CATALOG_KEYS) await db.catalog.put({ key, rows: (snapshot[key] ?? []) as unknown[] });
    for (const key of SCALAR_KEYS) await db.sync_meta.put({ key: `state.${key}`, value: snapshot[key] ?? null });
    for (const key of ENTITY_KEYS) {
      await db.sync_meta.put({ key: orderKey(key), value: idOrder((snapshot[key] ?? []) as unknown as Row[]) });
    }
  });
  const report = await validateAgainstSnapshot(db, snapshot, started_at);
  if (report.ok) {
    await setMeta(db, "migration_complete", { at: report.finished_at, report });
  } else {
    await setMeta(db, "migration_failed", { at: report.finished_at, report });
  }
  return report;
}

export async function validateAgainstSnapshot(db: EntityDb, snapshot: AppState, started_at: string): Promise<MigrationReport> {
  const errors: string[] = [];
  const counts: MigrationReport["counts"] = {};
  const totals: MigrationReport["totals_paise"] = {};
  for (const key of ENTITY_KEYS) {
    const raw = (snapshot[key] ?? []) as unknown as Row[];
    const expected = uniqueById(raw);
    const field = TOTAL_FIELDS[key];
    // Money tables are read back in full (totals); the rest only need their keys.
    const stored = field ? await db.entity(key).toArray() : [];
    const storedIdList = field ? stored.map((r) => r.id) : ((await db.entity(key).toCollection().primaryKeys()) as string[]);
    counts[key] = { snapshot: expected.length, stored: storedIdList.length, duplicates: raw.length - expected.length };
    if (storedIdList.length !== expected.length) errors.push(`${key}: expected ${expected.length} rows, stored ${storedIdList.length}`);
    const storedIds = new Set(storedIdList);
    const missing = expected.filter((r) => !storedIds.has(r.id)).map((r) => r.id);
    if (missing.length) errors.push(`${key}: missing ids ${missing.slice(0, 10).join(", ")}`);
    if (field) {
      const a = sumField(expected, field);
      const b = sumField(stored, field);
      totals[key] = { snapshot: a, stored: b };
      if (a !== b) errors.push(`${key}: ${field} total ${a} != ${b}`);
    }
  }
  const pendingSnapshot = (snapshot.syncQueue ?? []).filter((q) => !q.synced_at).length;
  const pendingStored = await db.outbox.count();
  if (pendingSnapshot !== pendingStored) errors.push(`outbox: expected ${pendingSnapshot}, stored ${pendingStored}`);
  return {
    ok: errors.length === 0,
    started_at,
    finished_at: new Date().toISOString(),
    counts,
    totals_paise: totals,
    pending_outbox: { snapshot: pendingSnapshot, stored: pendingStored },
    errors,
  };
}

// ---------------------------------------------------------------------------
// Load + incremental save
// ---------------------------------------------------------------------------

/** Assemble an AppState from the stores. Runtime fields are filled by the caller. */
export async function loadFromEntityStores(db: EntityDb): Promise<AppState> {
  const state = {} as Record<string, unknown>;
  await db.transaction("r", db.allTables, async () => {
    for (const key of ENTITY_KEYS) {
      const order = (await db.sync_meta.get(orderKey(key)))?.value as string[] | undefined;
      state[key] = restoreOrder(await db.entity(key).toArray(), order);
    }
    state.syncQueue = (await db.outbox.toArray()).sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const key of CATALOG_KEYS) state[key] = (await db.catalog.get(key))?.rows ?? [];
    for (const key of SCALAR_KEYS) state[key] = (await db.sync_meta.get(`state.${key}`))?.value ?? null;
  });
  state.tax_enabled = state.tax_enabled ?? true;
  state.online = typeof navigator !== "undefined" ? navigator.onLine : true;
  state.currentDeviceId = "";
  return state as unknown as AppState;
}

/**
 * Writes only rows that changed since the last save (compared by serialized value), deletes
 * rows that disappeared, and replaces the outbox. Replaces "put the whole AppState" on every
 * keystroke, which is what made large datasets slow.
 */
export class EntityWriter {
  private persisted = new Map<string, Map<string, string>>();
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private db: EntityDb) {}

  /** Seed the change tracker with what is already stored (after load/migration). */
  private orders = new Map<EntityKey, string>();

  prime(state: AppState) {
    this.persisted.clear();
    this.orders.clear();
    for (const key of ENTITY_KEYS) this.orders.set(key, idOrder((state[key] ?? []) as unknown as Row[]).join("\n"));
    for (const key of [...ENTITY_KEYS, "syncQueue"] as const) {
      const map = new Map<string, string>();
      for (const row of (state[key] ?? []) as unknown as Row[]) map.set(row.id, JSON.stringify(row));
      this.persisted.set(key, map);
    }
    for (const key of CATALOG_KEYS) {
      this.persisted.set(`catalog.${key}`, new Map([["rows", JSON.stringify(state[key] ?? [])]]));
    }
  }

  /** Serialized so overlapping saves never interleave. */
  save(state: AppState): Promise<{ puts: number; deletes: number }> {
    const run = this.chain.then(() => this.write(state));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async write(state: AppState) {
    const plan: { key: string; table: Table<Row, string>; puts: Row[]; deletes: string[]; next: Map<string, string> }[] = [];
    let puts = 0;
    let deletes = 0;
    for (const key of [...ENTITY_KEYS, "syncQueue"] as const) {
      const prev = this.persisted.get(key) ?? new Map<string, string>();
      const next = new Map<string, string>();
      const changed: Row[] = [];
      for (const row of (state[key] ?? []) as unknown as Row[]) {
        const json = JSON.stringify(row);
        next.set(row.id, json);
        if (prev.get(row.id) !== json) changed.push(row);
      }
      const removed = [...prev.keys()].filter((id) => !next.has(id));
      if (changed.length || removed.length) {
        const table = key === "syncQueue" ? (this.db.outbox as unknown as Table<Row, string>) : this.db.entity(key);
        plan.push({ key, table, puts: changed, deletes: removed, next });
        puts += changed.length;
        deletes += removed.length;
      }
    }
    const orderPuts: { key: EntityKey; ids: string[]; joined: string }[] = [];
    for (const key of ENTITY_KEYS) {
      const ids = idOrder((state[key] ?? []) as unknown as Row[]);
      const joined = ids.join("\n");
      if (this.orders.get(key) !== joined) orderPuts.push({ key, ids, joined });
    }
    const catalogPuts: { key: string; rows: unknown[]; json: string }[] = [];
    for (const key of CATALOG_KEYS) {
      const json = JSON.stringify(state[key] ?? []);
      if (this.persisted.get(`catalog.${key}`)?.get("rows") !== json) {
        catalogPuts.push({ key, rows: (state[key] ?? []) as unknown[], json });
      }
    }
    await this.db.transaction("rw", this.db.allTables, async () => {
      for (const p of plan) {
        if (p.puts.length) await p.table.bulkPut(p.puts.map((r) => structuredCloneSafe(r)));
        if (p.deletes.length) await p.table.bulkDelete(p.deletes);
      }
      for (const c of catalogPuts) await this.db.catalog.put({ key: c.key, rows: structuredCloneSafe(c.rows) });
      for (const key of SCALAR_KEYS) await this.db.sync_meta.put({ key: `state.${key}`, value: state[key] ?? null });
      for (const o of orderPuts) await this.db.sync_meta.put({ key: orderKey(o.key), value: o.ids });
    });
    for (const p of plan) this.persisted.set(p.key, p.next);
    for (const c of catalogPuts) this.persisted.set(`catalog.${c.key}`, new Map([["rows", c.json]]));
    for (const o of orderPuts) this.orders.set(o.key, o.joined);
    return { puts: puts + catalogPuts.length, deletes };
  }
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
