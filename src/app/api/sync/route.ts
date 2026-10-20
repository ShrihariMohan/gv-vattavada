import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const PULL_PAGE_SIZE = 1000;

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
  const requestedUntil = req.nextUrl.searchParams.get("until");
  const until = requestedUntil && !Number.isNaN(Date.parse(requestedUntil)) ? requestedUntil : new Date().toISOString();
  const requestedOffset = Number(req.nextUrl.searchParams.get("offset") ?? "0");
  const offset = Number.isSafeInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;
  let q = db
    .from("sync_records")
    .select("entity_type, entity_id, operation, payload, device_id, updated_at")
    // Stable primary-key ordering makes offset pagination deterministic while
    // `until` freezes the result set for the duration of a multi-page pull.
    .order("entity_type", { ascending: true })
    .order("entity_id", { ascending: true })
    .lte("updated_at", until)
    .range(offset, offset + PULL_PAGE_SIZE - 1);
  if (since) q = q.gt("updated_at", since);
  const { data, error } = await q;
  if (error) return NextResponse.json({ configured: true, error: error.message, records: [] }, { status: 500 });
  const records = data ?? [];
  return NextResponse.json({
    configured: true,
    records,
    until,
    next_offset: records.length === PULL_PAGE_SIZE ? offset + records.length : null,
  });
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

  return NextResponse.json(
    {
      configured: false,
      error: "Supabase is not configured; local changes were not marked as synced.",
    },
    { status: 503 },
  );
}
