import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cloudDumpToSql, type CloudBusinessRow, type CloudSyncRecord } from "@/domain/cloud-backup";

const PAGE = 1000;

async function allRows<T>(table: string, columns: string, order: string): Promise<T[]> {
  const db = supabaseAdmin();
  if (!db) return [];
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select(columns).order(order).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

export async function GET() {
  const db = supabaseAdmin();
  if (!db) {
    return NextResponse.json(
      { configured: false, error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      { status: 503 },
    );
  }
  try {
    const [syncRecords, businesses, schemaSql] = await Promise.all([
      allRows<CloudSyncRecord>("sync_records", "entity_type, entity_id, operation, payload, device_id, updated_at", "updated_at"),
      allRows<CloudBusinessRow>("businesses", "id, code, name, type, email, created_at", "id"),
      readFile(join(process.cwd(), "supabase/schema.sql"), "utf8"),
    ]);
    const exportedAt = new Date().toISOString();
    const sql = cloudDumpToSql({ exportedAt, schemaSql, syncRecords, businesses });
    const day = exportedAt.slice(0, 10);
    return new NextResponse(sql, {
      headers: {
        "Content-Type": "application/sql; charset=utf-8",
        "Content-Disposition": `attachment; filename="vbm-supabase-${day}.sql"`,
        "X-Backup-Sync-Records": String(syncRecords.length),
        "X-Backup-Businesses": String(businesses.length),
      },
    });
  } catch (e) {
    return NextResponse.json({ configured: true, error: e instanceof Error ? e.message : "Export failed" }, { status: 500 });
  }
}
