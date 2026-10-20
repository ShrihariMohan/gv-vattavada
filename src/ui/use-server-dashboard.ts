"use client";

import { useEffect, useState } from "react";
import { adminFetch, getAdminToken, serverReportsEnabled, type ArchiveStatus, type ServerDashboard } from "@/lib/admin-client";

/**
 * Server-side (SQL) dashboard figures. Returns null unless the `sql_reports` flag is on and this
 * device holds the admin token, in which case the page keeps its instant local figures.
 */
export function useServerDashboard(): ServerDashboard | null {
  const [data, setData] = useState<ServerDashboard | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!(await serverReportsEnabled())) return;
      try {
        const d = await adminFetch<ServerDashboard>("/api/reports?report=dashboard");
        if (!cancelled) setData(d);
      } catch {
        /* offline: local figures stay */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return data;
}

/** Months waiting to be archived, for a prominent reminder (admin devices only). */
export function useArchiveReminder(): { pending: string[]; level: string | null } | null {
  const [state, setState] = useState<{ pending: string[]; level: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!getAdminToken()) return;
    void adminFetch<ArchiveStatus>("/api/admin/archive?action=status")
      .then((s) => {
        if (!cancelled) setState({ pending: s.pending, level: s.database?.level ?? null });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
