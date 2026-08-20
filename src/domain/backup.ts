import { csvEscape } from "@/domain/rules";
import type { AppState } from "@/domain/types";

export const BACKUP_FORMAT = "vattavada-business-manager-backup";
export const BACKUP_VERSION = 1;

export type LocalBackup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exported_at: string;
  state: AppState;
};

export function buildBackup(state: AppState): LocalBackup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    state,
  };
}

export function backupToJson(state: AppState): string {
  return JSON.stringify(buildBackup(state), null, 2);
}

export function parseBackupJson(text: string): AppState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid backup");
  const row = parsed as Partial<LocalBackup> & { state?: AppState };
  const state = row.state ?? (row as unknown as AppState);
  if (!state || !Array.isArray(state.businesses) || !Array.isArray(state.users)) {
    throw new Error("Backup is missing businesses or users");
  }
  if (row.format && row.format !== BACKUP_FORMAT) throw new Error("Unrecognized backup format");
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
