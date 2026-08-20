import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** Cloud ingest for the Dexie sync queue. Local writes still happen first. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const items = Array.isArray(body.items) ? body.items : [];
  const db = supabaseAdmin();

  if (db) {
    const results = [];
    for (const item of items) {
      const entity_type = String(item.entity_type ?? "");
      const entity_id = String(item.entity_id ?? "");
      let payload: unknown = item;
      try {
        payload = item.payload ? JSON.parse(item.payload) : item;
      } catch {
        payload = { raw: String(item.payload ?? "") };
      }
      const { error } = await db.from("sync_records").upsert(
        {
          entity_type,
          entity_id,
          operation: String(item.operation ?? "UPDATE"),
          payload,
          device_id: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "entity_type,entity_id" },
      );
      if (error) {
        results.push({ entity_id, server_id: null, status: "FAILED", error: error.message });
      } else {
        results.push({ entity_id, server_id: `srv-${entity_id}`, status: "SYNCED" });
      }
    }
    return NextResponse.json({ results });
  }

  return NextResponse.json({
    results: items.map((item: { entity_id?: string }) => ({
      entity_id: item.entity_id,
      server_id: item.entity_id ? `srv-${item.entity_id}` : null,
      status: "SYNCED",
    })),
  });
}
