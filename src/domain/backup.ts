import { csvEscape } from "@/domain/rules";
import type { AppState } from "@/domain/types";

export const BACKUP_FORMAT = "vattavada-business-manager-backup";
/** v1 = whole AppState snapshot; v2 = normalized per-entity export (entity stores layout). */
export const BACKUP_VERSION = 2;

const ENTITY_KEYS = [
  "customers",
  "products",
  "rooms",
  "tables",
  "bookings",
  "orders",
  "orderItems",
  "invoices",
  "invoiceItems",
  "payments",
  "expenses",
  "ledger",
  "dailyClosings",
  "shifts",
  "auditLogs",
  "conflicts",
] as const satisfies readonly (keyof AppState)[];

const CATALOG_KEYS = [
  "businesses",
  "users",
  "devices",
  "roomTypes",
  "productCategories",
  "expenseCategories",
  "invoiceCounters",
] as const satisfies readonly (keyof AppState)[];

export type LocalBackupV1 = {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exported_at: string;
  state: AppState;
};

export type LocalBackupV2 = {
  format: typeof BACKUP_FORMAT;
  version: 2;
  schema: "entity-stores-v1";
  exported_at: string;
  device_id: string;
  catalog: Record<(typeof CATALOG_KEYS)[number], unknown[]>;
  entities: Record<(typeof ENTITY_KEYS)[number], unknown[]>;
  outbox: AppState["syncQueue"];
  meta: {
    lastSyncedAt: string | null;
    lastPulledAt: string | null;
    syncCursor: number | null;
    tax_enabled: boolean;
  };
  counts: Record<string, number>;
};

export type LocalBackup = LocalBackupV1 | LocalBackupV2;

export function buildBackup(state: AppState): LocalBackupV2 {
  const entities = Object.fromEntries(ENTITY_KEYS.map((k) => [k, state[k] ?? []])) as LocalBackupV2["entities"];
  const catalog = Object.fromEntries(CATALOG_KEYS.map((k) => [k, state[k] ?? []])) as LocalBackupV2["catalog"];
  return {
    format: BACKUP_FORMAT,
    version: 2,
    schema: "entity-stores-v1",
    exported_at: new Date().toISOString(),
    device_id: state.currentDeviceId,
    catalog,
    entities,
    outbox: (state.syncQueue ?? []).filter((q) => !q.synced_at),
    meta: {
      lastSyncedAt: state.lastSyncedAt ?? null,
      lastPulledAt: state.lastPulledAt ?? null,
      syncCursor: state.syncCursor ?? null,
      tax_enabled: state.tax_enabled !== false,
    },
    counts: Object.fromEntries(ENTITY_KEYS.map((k) => [k, (state[k] ?? []).length])),
  };
}

export function backupToJson(state: AppState): string {
  return JSON.stringify(buildBackup(state), null, 2);
}

function fromV2(row: LocalBackupV2): AppState {
  if (!row.catalog || !row.entities) throw new Error("Backup v2 is missing catalog or entities");
  const state = {
    ...Object.fromEntries(CATALOG_KEYS.map((k) => [k, Array.isArray(row.catalog[k]) ? row.catalog[k] : []])),
    ...Object.fromEntries(ENTITY_KEYS.map((k) => [k, Array.isArray(row.entities[k]) ? row.entities[k] : []])),
    syncQueue: Array.isArray(row.outbox) ? row.outbox : [],
    lastSyncedAt: row.meta?.lastSyncedAt ?? null,
    lastPulledAt: row.meta?.lastPulledAt ?? null,
    syncCursor: row.meta?.syncCursor ?? null,
    tax_enabled: row.meta?.tax_enabled !== false,
    currentUserId: null,
    currentDeviceId: row.device_id ?? "",
    online: true,
  } as unknown as AppState;
  for (const [key, expected] of Object.entries(row.counts ?? {})) {
    const actual = (state[key as keyof AppState] as unknown[] | undefined)?.length ?? 0;
    if (actual !== expected) throw new Error(`Backup is incomplete: ${key} has ${actual} rows, manifest says ${expected}`);
  }
  return state;
}

/** Accepts backup format v1 (whole snapshot) and v2 (normalized), returns an AppState. */
export function parseBackupJson(text: string): AppState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid backup");
  const row = parsed as Partial<LocalBackupV1> & Partial<LocalBackupV2> & { state?: AppState };
  if (row.format && row.format !== BACKUP_FORMAT) throw new Error("Unrecognized backup format");
  const state = row.version === 2 ? fromV2(row as LocalBackupV2) : (row.state ?? (row as unknown as AppState));
  if (!state || !Array.isArray(state.businesses) || !Array.isArray(state.users)) {
    throw new Error("Backup is missing businesses or users");
  }
  return state;
}

function csvFile(header: string[], rows: (string | number)[][]): string {
  return csvEscape([header, ...rows.map((r) => r.map(String))]);
}

export function backupCsvFiles(state: AppState): { name: string; body: string }[] {
  return [
    {
      name: "invoices.csv",
      body: csvFile(
        ["id", "business_id", "invoice_number", "type", "date", "total_paise", "paid_paise", "status", "payment_status"],
        state.invoices.map((i) => [
          i.id,
          i.business_id,
          i.invoice_number,
          i.invoice_type,
          i.business_date,
          i.total_paise,
          i.paid_amount_paise,
          i.status,
          i.payment_status,
        ]),
      ),
    },
    {
      name: "payments.csv",
      body: csvFile(
        ["id", "business_id", "invoice_id", "booking_id", "method", "amount_paise", "date"],
        state.payments.map((p) => [
          p.id,
          p.business_id,
          p.invoice_id ?? "",
          p.booking_id ?? "",
          p.method,
          p.amount_paise,
          p.business_date,
        ]),
      ),
    },
    {
      name: "bookings.csv",
      body: csvFile(
        ["id", "business_id", "room_id", "check_in", "check_out", "status", "total_paise", "paid_paise"],
        state.bookings.map((b) => [
          b.id,
          b.business_id,
          b.room_id,
          b.check_in,
          b.check_out,
          b.status,
          b.total_paise,
          b.paid_paise,
        ]),
      ),
    },
    {
      name: "expenses.csv",
      body: csvFile(
        ["id", "business_id", "category", "amount_paise", "method", "date", "description"],
        state.expenses.map((e) => [e.id, e.business_id, e.category, e.amount_paise, e.payment_method, e.business_date, e.description]),
      ),
    },
    {
      name: "orders.csv",
      body: csvFile(
        ["id", "business_id", "status", "guest_name", "guest_phone", "room_number", "table_id"],
        state.orders.map((o) => [
          o.id,
          o.business_id,
          o.status,
          o.guest_name,
          o.guest_phone,
          o.room_number,
          o.table_id ?? "",
        ]),
      ),
    },
    {
      name: "products.csv",
      body: csvFile(
        ["id", "name", "price_paise", "tax_bps", "sku", "active", "description", "tags"],
        state.products.map((p) => [
          p.id,
          p.name,
          p.price_paise,
          p.tax_bps,
          p.sku,
          p.active ? "yes" : "no",
          p.description ?? "",
          (p.tags ?? []).join("|"),
        ]),
      ),
    },
  ];
}
