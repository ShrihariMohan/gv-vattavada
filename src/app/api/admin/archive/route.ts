import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isoMonth, notConfigured, requireAdmin } from "@/lib/sync-server";

const TABLES = new Set([
  "invoice_items",
  "payments",
  "ledger_entries",
  "expenses",
  "daily_closings",
  "shifts",
  "invoices",
  "order_items",
  "orders",
  "bookings",
]);
const TIME_BUDGET_MS = 7_000;

/**
 * Monthly archive (admin only).
 *   GET  ?action=status                          pending / archived / verified months + DB size
 *   GET  ?action=rows&month&table&after&limit    one keyset page of a month's detail rows
 *   GET  ?action=digest&month                    server digest (counts, totals, id hashes)
 *   GET  ?action=references&month                catalog rows the detail points at (rooms)
 *   POST {action:"verify", month, digest, manifest}   compare the re-uploaded bundle's digest
 *   POST {action:"archive", month}               summaries + mark archived + bounded purge steps
 */
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const db = supabaseAdmin();
  if (!db) return notConfigured();
  const p = req.nextUrl.searchParams;
  const action = p.get("action") ?? "status";

  if (action === "status") {
    const [status, size] = await Promise.all([db.rpc("archive_status"), db.rpc("db_size_report")]);
    if (status.error) return NextResponse.json({ error: status.error.message }, { status: 500 });
    return NextResponse.json({ ...(status.data as object), database: size.data ?? null });
  }

  const month = isoMonth(p.get("month"));
  if (!month) return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });

  if (action === "digest") {
    const { data, error } = await db.rpc("archive_digest", { p_month: month });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === "references") {
    const { data, error } = await db.rpc("archive_reference_rows", { p_month: month });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === "rows") {
    const table = p.get("table") ?? "";
    if (!TABLES.has(table)) return NextResponse.json({ error: "unknown table" }, { status: 400 });
    const limit = Math.min(Math.max(Number(p.get("limit")) || 500, 1), 1000);
    const { data, error } = await db.rpc("archive_month_rows", {
      p_month: month,
      p_table: table,
      p_after: p.get("after") ?? "",
      p_limit: limit,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = (data ?? []) as { id: string }[];
    return NextResponse.json({ rows, next_after: rows.length === limit ? rows[rows.length - 1].id : null });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const db = supabaseAdmin();
  if (!db) return notConfigured();
  const body = (await req.json().catch(() => ({}))) as { action?: string; month?: string; digest?: unknown; manifest?: unknown };
  const month = isoMonth(body.month ?? null);
  if (!month) return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });

  if (body.action === "verify") {
    if (!body.digest || typeof body.digest !== "object") return NextResponse.json({ error: "digest required" }, { status: 400 });
    const { data, error } = await db.rpc("archive_verify", { p_month: month, p_digest: body.digest, p_manifest: body.manifest ?? {} });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  }

  if (body.action === "archive") {
    const begin = await db.rpc("archive_begin", { p_month: month });
    if (begin.error) return NextResponse.json({ error: begin.error.message }, { status: 400 });
    const started = Date.now();
    let last: { deleted: number; remaining: number; note?: string } = { deleted: 0, remaining: -1 };
    let deleted = 0;
    while (Date.now() - started < TIME_BUDGET_MS) {
      const step = await db.rpc("archive_purge_step", { p_month: month, p_limit: 500 });
      if (step.error) return NextResponse.json({ error: step.error.message, deleted }, { status: 500 });
      last = step.data as typeof last;
      deleted += last.deleted;
      if (last.remaining === 0) break;
    }
    // remaining > 0: call again; archive_begin is idempotent for an already archived month.
    return NextResponse.json({ ok: true, begin: begin.data, deleted, remaining: last.remaining, note: last.note ?? null });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
