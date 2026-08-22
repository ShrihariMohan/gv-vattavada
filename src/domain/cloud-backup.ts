export const CLOUD_BACKUP_FORMAT = "vattavada-business-manager-cloud-sql";

export type CloudSyncRecord = {
  entity_type: string;
  entity_id: string;
  operation: string;
  payload: unknown;
  device_id: string | null;
  updated_at: string;
};

export type CloudBusinessRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  email: string | null;
  created_at?: string;
};

export function sqlLiteral(value: string | null | undefined): string {
  if (value == null) return "NULL";
  return `'${value.replace(/'/g, "''").replace(/\0/g, "")}'`;
}

export function sqlJsonb(value: unknown): string {
  const json = JSON.stringify(value ?? {}).replace(/\u0000/g, "");
  return `${sqlLiteral(json)}::jsonb`;
}

export function sqlTimestamp(value: string | null | undefined): string {
  if (!value) return "now()";
  return `${sqlLiteral(value)}::timestamptz`;
}

const INSERT_BATCH = 80;

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function syncValues(row: CloudSyncRecord): string {
  return `(${sqlLiteral(row.entity_type)}, ${sqlLiteral(row.entity_id)}, ${sqlLiteral(row.operation)}, ${sqlJsonb(row.payload)}, ${sqlLiteral(row.device_id)}, ${sqlTimestamp(row.updated_at)})`;
}

function businessValues(row: CloudBusinessRow): string {
  return `(${sqlLiteral(row.id)}, ${sqlLiteral(row.code)}, ${sqlLiteral(row.name)}, ${sqlLiteral(row.type)}, ${sqlLiteral(row.email)}, ${sqlTimestamp(row.created_at)})`;
}

/** One .sql file: schema + upserts. Paste into a new Supabase SQL editor or `psql -f`. */
export function cloudDumpToSql(input: {
  exportedAt: string;
  schemaSql: string;
  syncRecords: CloudSyncRecord[];
  businesses: CloudBusinessRow[];
}): string {
  const lines: string[] = [
    `-- ${CLOUD_BACKUP_FORMAT}`,
    `-- Cloudy Group cloud backup (Postgres / Supabase)`,
    `-- Exported: ${input.exportedAt}`,
    `-- sync_records: ${input.syncRecords.length}`,
    `-- businesses: ${input.businesses.length}`,
    `--`,
    `-- Restore on a new project:`,
    `--   1. Create a Postgres database (empty Supabase project is fine).`,
    `--   2. Run this whole file in the SQL editor, or:`,
    `--      psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f thisfile.sql`,
    `--   3. Point the app at the new URL + service role key.`,
    `-- Device Dexie is separate: restore that from Settings → Local backup JSON.`,
    `--`,
    `BEGIN;`,
    ``,
    input.schemaSql.trim(),
    ``,
  ];

  if (input.businesses.length) {
    lines.push(`-- catalog businesses`);
    for (const batch of chunk(input.businesses, INSERT_BATCH)) {
      lines.push(
        `insert into public.businesses (id, code, name, type, email, created_at) values`,
        batch.map(businessValues).join(",\n"),
        `on conflict (id) do update set code = excluded.code, name = excluded.name, type = excluded.type, email = excluded.email;`,
        ``,
      );
    }
  }

  if (input.syncRecords.length) {
    lines.push(`-- synced entities (invoices, bookings, products, …)`);
    for (const batch of chunk(input.syncRecords, INSERT_BATCH)) {
      lines.push(
        `insert into public.sync_records (entity_type, entity_id, operation, payload, device_id, updated_at) values`,
        batch.map(syncValues).join(",\n"),
        `on conflict (entity_type, entity_id) do update set`,
        `  operation = excluded.operation,`,
        `  payload = excluded.payload,`,
        `  device_id = excluded.device_id,`,
        `  updated_at = excluded.updated_at;`,
        ``,
      );
    }
  } else {
    lines.push(`-- No sync_records in this dump.`);
    lines.push(``);
  }

  lines.push(`COMMIT;`, ``);
  return lines.join("\n");
}
