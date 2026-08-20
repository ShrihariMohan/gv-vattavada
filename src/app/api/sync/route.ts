import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const health = req.nextUrl.searchParams.get("health");
  if (health) {
    if (!db) {
      return NextResponse.json({
        configured: false,
        ok: false,
        error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      });
    }
    const { count, error } = await db.from("sync_records").select("*", { count: "exact", head: true });
    if (error) return NextResponse.json({ configured: true, ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ configured: true, ok: true, count: count ?? 0 });
  }

  if (!db) return NextResponse.json({ configured: false, records: [] });
  const since = req.nextUrl.searchParams.get("since");
  let q = db
    .from("sync_records")
    .select("entity_type, entity_id, operation, payload, device_id, updated_at")
    .order("updated_at", { ascending: true })
    .limit(1000);
  if (since) q = q.gt("updated_at", since);
  const { data, error } = await q;
  if (error) return NextResponse.json({ configured: true, error: error.message, records: [] }, { status: 500 });
  return NextResponse.json({ configured: true, records: data ?? [] });
}

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
      let payload: Record<string, unknown> = {};
      try {
        payload = item.payload ? JSON.parse(item.payload) : item;
      } catch {
        payload = { raw: String(item.payload ?? "") };
      }
      const device_id = String(payload.device_id ?? item.device_id ?? "") || null;
      const { error } = await db.from("sync_records").upsert(
        {
          entity_type,
          entity_id,
          operation: String(item.operation ?? "UPDATE"),
          payload,
          device_id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "entity_type,entity_id" },
      );
      if (error) {
        results.push({ entity_id, server_id: null, status: "FAILED", error: error.message, remote_payload: error.message });
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
