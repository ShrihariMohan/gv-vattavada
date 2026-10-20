import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isoDate, isoMonth, notConfigured, requireAdmin } from "@/lib/sync-server";

type Spec = { rpc: string; build: (p: URLSearchParams) => Record<string, unknown> | string };

const business = (p: URLSearchParams) => {
  const b = p.get("business_id");
  return b && /^[\w-]{1,64}$/.test(b) ? b : null;
};

function range(p: URLSearchParams): { p_from: string; p_to: string } | string {
  const from = isoDate(p.get("from"));
  const to = isoDate(p.get("to"));
  if (!from || !to) return "from and to must be YYYY-MM-DD";
  if (from > to) return "from must be on or before to";
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (days > 3700) return "range too large";
  return { p_from: from, p_to: to };
}

function withBusiness(p: URLSearchParams, required: boolean) {
  const r = range(p);
  if (typeof r === "string") return r;
  const b = business(p);
  if (required && !b) return "business_id is required";
  return { ...r, p_business: b };
}

/** One RPC per screen; every handler only validates parameters and forwards. */
const REPORTS: Record<string, Spec> = {
  dashboard: {
    rpc: "report_dashboard",
    build: (p) => ({ p_today: isoDate(p.get("today")) ?? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) }),
  },
  analytics: { rpc: "report_analytics", build: (p) => withBusiness(p, false) },
  items: {
    rpc: "report_item_sales",
    build: (p) => {
      const r = withBusiness(p, true);
      return typeof r === "string" ? r : { ...r, p_limit: Math.min(Number(p.get("limit")) || 10, 100) };
    },
  },
  "item-trends": {
    rpc: "report_item_trends",
    build: (p) => {
      const from = isoMonth(p.get("from_month"));
      const to = isoMonth(p.get("to_month"));
      const b = business(p);
      if (!from || !to || !b) return "business_id, from_month and to_month (YYYY-MM) are required";
      return { p_business: b, p_from_month: from, p_to_month: to, p_limit: Math.min(Number(p.get("limit")) || 10, 100) };
    },
  },
  "sales-by-time": {
    rpc: "report_sales_by_time",
    build: (p) => {
      const r = withBusiness(p, true);
      if (typeof r === "string") return r;
      const hour = (k: string, d: number) => {
        const v = Number(p.get(k));
        return Number.isInteger(v) && v >= 0 && v <= 23 ? v : d;
      };
      return {
        ...r,
        p_morning_start: hour("morning", 5),
        p_afternoon_start: hour("afternoon", 12),
        p_evening_start: hour("evening", 17),
        p_night_start: hour("night", 22),
      };
    },
  },
  "payment-mix": { rpc: "report_payment_mix", build: (p) => withBusiness(p, true) },
  reconciliation: { rpc: "report_reconciliation", build: (p) => withBusiness(p, true) },
  stay: { rpc: "report_stay", build: (p) => withBusiness(p, true) },
};

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const db = supabaseAdmin();
  if (!db) return notConfigured();
  const name = req.nextUrl.searchParams.get("report") ?? "";
  const spec = REPORTS[name];
  if (!spec) return NextResponse.json({ error: `unknown report; use one of ${Object.keys(REPORTS).join(", ")}` }, { status: 400 });
  const args = spec.build(req.nextUrl.searchParams);
  if (typeof args === "string") return NextResponse.json({ error: args }, { status: 400 });
  const { data, error } = await db.rpc(spec.rpc, args);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=30" } });
}
