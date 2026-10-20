import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  featureFlags,
  isMissingFunction,
  MAX_BATCH_BYTES,
  MAX_BATCH_ITEMS,
  PULL_LIMIT_DEFAULT,
  PULL_LIMIT_MAX,
} from "@/lib/sync-server";

const PULL_PAGE_SIZE = 1000;

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const params = req.nextUrl.searchParams;
  const health = params.get("health");
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
    const flags = await featureFlags(db);
    return NextResponse.json({
      configured: true,
      ok: true,
      count: count ?? 0,
      cursor_sync: flags.normalized_reads,
      batch_push: true,
      sql_reports: flags.sql_reports,
    });
  }

  if (!db) return NextResponse.json({ configured: false, records: [] });

  // Cursor mode (new clients): /api/sync?after=<change_seq>&limit=500&device_id=…
  const after = params.get("after");
  if (after !== null) {
    const flags = await featureFlags(db);
    if (!flags.normalized_reads) {
      // Client falls back to the legacy timestamp pull until normalized reads are enabled.
      return NextResponse.json({ configured: true, cursor_supported: false, records: [] });
    }
    const cursor = Number(after);
    if (!Number.isSafeInteger(cursor) || cursor < 0) {
      return NextResponse.json({ configured: true, error: "invalid cursor", resync_required: true, records: [] }, { status: 400 });
    }
    const requested = Number(params.get("limit") ?? PULL_LIMIT_DEFAULT);
    const limit = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, PULL_LIMIT_MAX) : PULL_LIMIT_DEFAULT;
    const deviceId = params.get("device_id");
    const { data, error } = await db.rpc("sync_pull", { p_after: cursor, p_limit: limit, p_device_id: deviceId });
    if (error) {
      if (isMissingFunction(error)) return NextResponse.json({ configured: true, cursor_supported: false, records: [] });
      return NextResponse.json({ configured: true, error: error.message, records: [] }, { status: 500 });
    }
    const page = data as { records: unknown[]; next_cursor: number; has_more: boolean; max_cursor: number };
    if (cursor > Number(page.max_cursor ?? 0)) {
      // Cursor from a different/restored database: never return a partial view silently.
      return NextResponse.json({ configured: true, cursor_supported: true, resync_required: true, records: [] }, { status: 409 });
    }
    if (deviceId) {
      // `after` is what the device has applied and stored, i.e. its acknowledged cursor.
      await db.rpc("sync_ack_cursor", { p_device_id: deviceId, p_cursor: cursor, p_client_version: req.headers.get("x-client-version") });
    }
    return NextResponse.json({ configured: true, cursor_supported: true, ...page });
  }

  // Legacy timestamp/offset pull (kept for old clients during the rollback window).
  const since = params.get("since");
  const requestedUntil = params.get("until");
  const until = requestedUntil && !Number.isNaN(Date.parse(requestedUntil)) ? requestedUntil : new Date().toISOString();
  const requestedOffset = Number(params.get("offset") ?? "0");
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

type PushItem = {
  mutation_id?: string;
  entity_type?: string;
  entity_id?: string;
  operation?: string;
  payload?: unknown;
  device_id?: string;
};

/**
 * Cloud ingest for the Dexie outbox. Local writes still happen first.
 * Old clients send one item per request; new clients send up to 100 items with mutation ids.
 * When the sync functions exist, the whole batch runs in ONE Postgres transaction that writes
 * `sync_records` and (when dual_write is on) the normalized tables together.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > MAX_BATCH_BYTES) {
    return NextResponse.json({ error: `batch larger than ${MAX_BATCH_BYTES} bytes` }, { status: 413 });
  }
  let body: { items?: PushItem[]; device_id?: string; client_version?: string };
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length > MAX_BATCH_ITEMS) {
    return NextResponse.json({ error: `at most ${MAX_BATCH_ITEMS} items per batch` }, { status: 413 });
  }
  const db = supabaseAdmin();
  if (!db) {
    return NextResponse.json(
      { configured: false, error: "Supabase is not configured; local changes were not marked as synced." },
      { status: 503 },
    );
  }
  if (!items.length) return NextResponse.json({ results: [] });

  const deviceId = body.device_id ?? req.headers.get("x-device-id") ?? null;
  const clientVersion = body.client_version ?? req.headers.get("x-client-version") ?? null;
  const rpcItems = items.map((item) => ({
    mutation_id: item.mutation_id ?? null,
    entity_type: String(item.entity_type ?? ""),
    entity_id: String(item.entity_id ?? ""),
    operation: String(item.operation ?? "UPDATE"),
    payload: item.payload ?? null,
    device_id: item.device_id ?? null,
  }));
  const { data, error } = await db.rpc("sync_apply_batch", {
    p_items: rpcItems,
    p_device_id: deviceId,
    p_client_version: clientVersion,
  });
  if (!error) return NextResponse.json({ results: data ?? [] });
  if (!isMissingFunction(error)) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Migrations not applied yet: identical behaviour to the pre-migration route.
  const results = [];
  for (const item of items) {
    const entity_type = String(item.entity_type ?? "");
    const entity_id = String(item.entity_id ?? "");
    let payload: Record<string, unknown> = {};
    try {
      payload =
        typeof item.payload === "string"
          ? JSON.parse(item.payload)
          : item.payload && typeof item.payload === "object"
            ? (item.payload as Record<string, unknown>)
            : (item as Record<string, unknown>);
    } catch {
      payload = { raw: String(item.payload ?? "") };
    }
    const device_id = String(payload.device_id ?? item.device_id ?? "") || null;
    const { error: upsertError } = await db.from("sync_records").upsert(
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
    if (upsertError) {
      results.push({
        mutation_id: item.mutation_id ?? null,
        entity_id,
        server_id: null,
        status: "FAILED",
        error: upsertError.message,
        remote_payload: upsertError.message,
      });
    } else {
      results.push({ mutation_id: item.mutation_id ?? null, entity_id, server_id: `srv-${entity_id}`, status: "SYNCED" });
    }
  }
  return NextResponse.json({ results });
}
