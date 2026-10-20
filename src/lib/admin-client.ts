"use client";

/**
 * Browser helpers for the admin-only server routes. The admin token (`SYNC_ADMIN_TOKEN`) is
 * entered once on the admin's device and kept in this browser only.
 */
const TOKEN_KEY = "vbm-admin-token";

export function getAdminToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAdminToken(token: string) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
}

export async function adminFetch<T>(path: string, init?: { method?: "GET" | "POST"; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: {
      "x-admin-token": getAdminToken(),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export type ServerDashboard = {
  today_date: string;
  today: number;
  month: number;
  restaurant: number;
  stay: number;
  by_business: {
    business_id: string;
    today: number;
    month: number;
    year: number;
    revenue: number;
    expenses: number;
    profit: number;
    transactions: number;
    avg: number;
  }[];
};

export type ArchiveStatus = {
  current_month: string;
  retention_floor: string;
  pending: string[];
  archived: { month: string; archived_at: string }[];
  carried_over: string[];
  verified: { month: string; verified_at: string }[];
  database: { database_bytes: number; level: "ok" | "warn" | "alert"; warn_bytes: number; alert_bytes: number } | null;
};

/** Server SQL figures are used only when enabled server-side and this device holds the admin token. */
export async function serverReportsEnabled(): Promise<boolean> {
  if (!getAdminToken()) return false;
  try {
    const res = await fetch("/api/sync?health=1");
    const info = (await res.json()) as { sql_reports?: boolean };
    return Boolean(info.sql_reports);
  } catch {
    return false;
  }
}
