import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

/** Request limits for batched pushes (plan: 100 mutations / 512 KB). */
export const MAX_BATCH_ITEMS = 100;
export const MAX_BATCH_BYTES = 512 * 1024;
export const PULL_LIMIT_DEFAULT = 500;
export const PULL_LIMIT_MAX = 1000;

export type FeatureFlags = {
  dual_write: boolean;
  normalized_reads: boolean;
  legacy_writes: boolean;
  sql_reports: boolean;
  /** true once the normalized migrations exist in the database */
  normalized_schema: boolean;
};

const LEGACY_ONLY: FeatureFlags = {
  dual_write: false,
  normalized_reads: false,
  legacy_writes: true,
  sql_reports: false,
  normalized_schema: false,
};

let cached: { at: number; flags: FeatureFlags } | null = null;
const FLAG_TTL_MS = 15_000;

/**
 * Server-side feature flags live in `public.feature_flags` so they can be flipped without a
 * redeploy. `SYNC_FORCE_LEGACY=true` is an env kill switch that wins over the table (rollback).
 */
export async function featureFlags(db: SupabaseClient, opts?: { fresh?: boolean }): Promise<FeatureFlags> {
  if (process.env.SYNC_FORCE_LEGACY === "true") return LEGACY_ONLY;
  if (!opts?.fresh && cached && Date.now() - cached.at < FLAG_TTL_MS) return cached.flags;
  const { data, error } = await db.from("feature_flags").select("key, enabled");
  if (error) {
    // Table missing = migrations not applied yet. Behave exactly like the legacy app.
    cached = { at: Date.now(), flags: LEGACY_ONLY };
    return LEGACY_ONLY;
  }
  const map = new Map((data ?? []).map((r: { key: string; enabled: boolean }) => [r.key, r.enabled]));
  const flags: FeatureFlags = {
    dual_write: map.get("dual_write") === true,
    normalized_reads: map.get("normalized_reads") === true,
    legacy_writes: map.get("legacy_writes") !== false,
    sql_reports: map.get("sql_reports") === true,
    normalized_schema: true,
  };
  cached = { at: Date.now(), flags };
  return flags;
}

export function resetFlagCache() {
  cached = null;
}

/** True when PostgREST says the RPC does not exist (migrations not applied). */
export function isMissingFunction(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "PGRST202" || error.code === "42883" || /Could not find the function/i.test(error.message ?? "");
}

/**
 * Admin-only routes (reconcile, backfill, flags, reports, archive) require the shared secret
 * `SYNC_ADMIN_TOKEN` in the `x-admin-token` header. Staff logins are local to devices, so the
 * server cannot see them; the token is entered once on the admin device in Settings.
 */
export function requireAdmin(req: NextRequest): NextResponse | null {
  const expected = process.env.SYNC_ADMIN_TOKEN;
  if (!expected || expected.length < 16) {
    return NextResponse.json(
      { error: "SYNC_ADMIN_TOKEN is not configured on the server (min 16 characters)" },
      { status: 503 },
    );
  }
  const given = req.headers.get("x-admin-token") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Admin token required" }, { status: 401 });
  }
  return null;
}

export function notConfigured() {
  return NextResponse.json(
    { configured: false, error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
    { status: 503 },
  );
}

/** YYYY-MM-DD validation for report parameters. */
export function isoDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const t = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(t) ? null : value;
}

/** YYYY-MM validation for archive parameters. */
export function isoMonth(value: string | null): string | null {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  return value;
}
