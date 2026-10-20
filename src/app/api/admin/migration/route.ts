import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { featureFlags, notConfigured, requireAdmin, resetFlagCache } from "@/lib/sync-server";

/** Keep each request well inside the Vercel Hobby function limit. */
const TIME_BUDGET_MS = 7_000;
const FLAG_KEYS = new Set(["dual_write", "normalized_reads", "legacy_writes", "sql_reports"]);

/**
 * Admin-only migration controls (header `x-admin-token`).
 *   GET  ?action=status            flags, quarantine size, devices, database size
 *   GET  ?action=reconcile         legacy vs normalized report (counts, IDs, totals, invariants)
 *   POST {action:"backfill", batch?}          resumable backfill; call until done=true
 *   POST {action:"backfill-reset"}            restart the backfill checkpoint (idempotent upserts)
 *   POST {action:"retry-quarantine"}          retry parked rows whose parents may have arrived
 *   POST {action:"set-flag", key, enabled}    flip a server feature flag
 */
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const db = supabaseAdmin();
  if (!db) return notConfigured();
  const action = req.nextUrl.searchParams.get("action") ?? "status";

  if (action === "reconcile") {
    const { data, error } = await db.rpc("sync_reconcile", { p_sample: 50 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === "status") {
    const flags = await featureFlags(db, { fresh: true });
    const [size, quarantine, devices, checkpoint] = await Promise.all([
      db.rpc("db_size_report"),
      db.from("migration_quarantine").select("*", { count: "exact", head: true }),
      db.from("sync_devices").select("device_id, last_cursor, last_pull_at, last_push_at, client_version").order("last_pull_at", { ascending: false }),
      db.from("migration_checkpoints").select("*"),
    ]);
    return NextResponse.json({
      flags,
      database: size.data ?? null,
      quarantined: quarantine.count ?? null,
      devices: devices.data ?? [],
      checkpoints: checkpoint.data ?? [],
      errors: [size.error, quarantine.error, devices.error, checkpoint.error].filter(Boolean).map((e) => e!.message),
    });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const db = supabaseAdmin();
  if (!db) return notConfigured();
  const body = (await req.json().catch(() => ({}))) as { action?: string; batch?: number; key?: string; enabled?: boolean };

  if (body.action === "backfill") {
    const batch = Math.min(Math.max(Number(body.batch) || 500, 1), 2000);
    const started = Date.now();
    const totals = { processed: 0, applied: 0, superseded: 0, quarantined: 0, done: false, calls: 0 };
    while (Date.now() - started < TIME_BUDGET_MS) {
      const { data, error } = await db.rpc("sync_backfill", { p_batch: batch });
      if (error) return NextResponse.json({ error: error.message, ...totals }, { status: 500 });
      const r = data as { processed: number; applied: number; superseded: number; quarantined: number; done: boolean };
      totals.calls += 1;
      totals.processed += r.processed;
      totals.applied += r.applied;
      totals.superseded += r.superseded;
      totals.quarantined += r.quarantined;
      if (r.done) {
        totals.done = true;
        break;
      }
    }
    return NextResponse.json(totals);
  }

  if (body.action === "backfill-reset") {
    const { error } = await db.rpc("sync_backfill_reset");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "retry-quarantine") {
    const { data, error } = await db.rpc("sync_retry_quarantine", { p_limit: 1000 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (body.action === "set-flag") {
    if (!body.key || !FLAG_KEYS.has(body.key) || typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "key must be one of dual_write, normalized_reads, legacy_writes, sql_reports" }, { status: 400 });
    }
    if (body.key === "legacy_writes" && body.enabled === false) {
      const { data } = await db.from("sync_devices").select("device_id, client_version");
      const old = (data ?? []).filter((d: { client_version: string | null }) => !d.client_version);
      if (old.length) {
        return NextResponse.json(
          { error: "Some devices have not reported a cursor-sync client version yet", devices: old },
          { status: 409 },
        );
      }
    }
    const { error } = await db
      .from("feature_flags")
      .update({ enabled: body.enabled, updated_at: new Date().toISOString() })
      .eq("key", body.key);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    resetFlagCache();
    return NextResponse.json({ flags: await featureFlags(db, { fresh: true }) });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
