"use client";

import { createCatalogState } from "@/domain/seed";
import { AppService, createDefaultSyncAdapter, type SyncAdapter } from "@/domain/service";
import { loadState, normalizeState, saveState } from "@/db/persist";
import type { AppState, Role, User } from "@/domain/types";
import { registerAppServiceWorker } from "@/pwa/service-worker";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Ctx = {
  ready: boolean;
  service: AppService;
  user: User | null;
  refresh: () => void;
  login: (u: string, p: string) => void;
  logout: () => void;
  can: (action: Parameters<AppService["require"]>[0]) => boolean;
  syncAdapter: SyncAdapter;
  restoreBackup: (incoming: AppState) => void;
  /** Background sync progress (startup never waits for the cloud). */
  syncing: boolean;
  syncDetail: string;
  syncNow: (opts?: { full?: boolean }) => Promise<void>;
};

const AppCtx = createContext<Ctx | null>(null);

function deviceId() {
  if (typeof window === "undefined") return crypto.randomUUID();
  const key = "vbm-device-id";
  let id = localStorage.getItem(key);
  if (!id || id === "DEVICE-RESTAURANT-TABLET-01") {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

function currentDeviceId() {
  return typeof window === "undefined" ? null : deviceId();
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const svc = useRef<AppService | null>(null);
  const adapter = useRef<SyncAdapter>(createDefaultSyncAdapter(currentDeviceId));
  const flushing = useRef(false);
  const cloudConfigured = useRef<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncDetail, setSyncDetail] = useState("");

  const persistTick = useCallback(() => {
    if (svc.current) void saveState(svc.current.state);
    setTick((t) => t + 1);
  }, []);

  /**
   * Push the outbox in batches, then pull only what changed (cursor, or the legacy timestamp
   * pull with overlap while the server is still on legacy reads). Never blocks rendering.
   */
  const flushQueue = useCallback(async (opts?: { full?: boolean }) => {
    if (!svc.current?.state.online || flushing.current) return;
    flushing.current = true;
    try {
      if (cloudConfigured.current === null) {
        const health = await fetch("/api/sync?health=1");
        const info = (await health.json()) as { configured?: boolean };
        cloudConfigured.current = Boolean(info.configured);
      }
      if (!cloudConfigured.current) return;
      setSyncing(true);
      const pending = svc.current.pendingCount();
      if (pending) setSyncDetail(`Uploading ${pending} changes…`);
      await svc.current.processSyncQueue(adapter.current);
      setSyncDetail("Downloading changes…");
      const first = !svc.current.state.lastPulledAt && svc.current.state.syncCursor == null;
      await svc.current.pullFromRemote(adapter.current, {
        full: opts?.full || first,
        onProgress: (n) => setSyncDetail(`Downloaded ${n} changes…`),
      });
      await saveState(svc.current.state);
      setTick((t) => t + 1);
    } catch {
      /* stay on local Dexie if cloud is down */
    } finally {
      flushing.current = false;
      setSyncing(false);
      setSyncDetail("");
    }
  }, []);

  const refresh = useCallback(() => {
    persistTick();
    if (svc.current && svc.current.pendingCount() > 0) void flushQueue();
  }, [persistTick, flushQueue]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Render from local indexed data immediately; cloud sync runs in the background.
      let stored: AppState | null = null;
      try {
        stored = await loadState();
      } catch {
        stored = null;
      }
      let state: AppState;
      if (stored) {
        state = stored;
      } else {
        state = createCatalogState(deviceId());
      }
      state.currentDeviceId = deviceId();
      state.online = navigator.onLine;
      if (cancelled) return;
      svc.current = new AppService(state);
      setReady(true);
      setTick((t) => t + 1);
      // Persist after first paint (normalization may have touched rows); never on the startup path.
      window.setTimeout(() => {
        if (svc.current) void saveState(svc.current.state);
      }, 1_000);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void flushQueue();
  }, [ready, flushQueue]);

  useEffect(() => {
    // Flush pending saves when the tab is hidden/closed so nothing is lost on mobile.
    const onHide = () => {
      if (svc.current) void saveState(svc.current.state);
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  useEffect(() => {
    const on = () => {
      if (!svc.current) return;
      svc.current.setOnline(true);
      void flushQueue();
    };
    const off = () => {
      svc.current?.setOnline(false);
      persistTick();
    };
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "FLUSH_SYNC") void flushQueue();
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    const t = window.setInterval(() => {
      void flushQueue();
    }, 15000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      window.clearInterval(t);
    };
  }, [flushQueue, persistTick]);

  useEffect(() => {
    void registerAppServiceWorker();
  }, []);

  const value = useMemo(() => {
    const service = svc.current ?? new AppService(createCatalogState(deviceId()));
    const user = service.state.users.find((u) => u.id === service.state.currentUserId) ?? null;
    const role: Role | null = user?.role ?? null;
    return {
      ready,
      service,
      user,
      refresh,
      login: (u: string, p: string) => {
        service.login(u, p);
        refresh();
      },
      logout: () => {
        service.logout();
        refresh();
      },
      can: (action: Parameters<AppService["require"]>[0]) => {
        if (!role) return false;
        try {
          service.require(action);
          return true;
        } catch {
          return false;
        }
      },
      syncAdapter: adapter.current,
      syncing,
      syncDetail,
      syncNow: flushQueue,
      restoreBackup: (incoming: AppState) => {
        const keepUser = service.state.currentUserId;
        const next = normalizeState(incoming);
        next.currentDeviceId = deviceId();
        next.online = typeof navigator !== "undefined" ? navigator.onLine : true;
        if (keepUser && next.users.some((u) => u.id === keepUser)) next.currentUserId = keepUser;
        svc.current = new AppService(next);
        refresh();
      },
    };
  }, [ready, refresh, tick, syncing, syncDetail, flushQueue]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp outside provider");
  return ctx;
}
