"use client";

import { createCatalogState } from "@/domain/seed";
import { AppService, createDefaultSyncAdapter, type SyncAdapter } from "@/domain/service";
import { loadState, mergeLocalSafety, normalizeState, saveState } from "@/db/persist";
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const svc = useRef<AppService | null>(null);
  const adapter = useRef<SyncAdapter>(createDefaultSyncAdapter());
  const flushing = useRef(false);

  const persistTick = useCallback(() => {
    if (svc.current) void saveState(svc.current.state);
    setTick((t) => t + 1);
  }, []);

  const flushQueue = useCallback(async () => {
    if (!svc.current?.state.online || flushing.current) return;
    flushing.current = true;
    try {
      await svc.current.processSyncQueue(adapter.current);
      await svc.current.pullFromRemote(adapter.current, { full: true });
      await saveState(svc.current.state);
      setTick((t) => t + 1);
    } catch {
      /* stay on local Dexie if cloud is down */
    } finally {
      flushing.current = false;
    }
  }, []);

  const refresh = useCallback(() => {
    persistTick();
    if (svc.current && svc.current.pendingCount() > 0) void flushQueue();
  }, [persistTick, flushQueue]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadState();
      const catalog = createCatalogState(deviceId());
      catalog.currentDeviceId = deviceId();
      catalog.online = navigator.onLine;
      if (stored) mergeLocalSafety(catalog, stored);
      if (cancelled) return;
      svc.current = new AppService(catalog);
      try {
        const health = await fetch("/api/sync?health=1");
        const info = (await health.json()) as { configured?: boolean };
        if (info.configured) {
          await svc.current.processSyncQueue(adapter.current);
          await svc.current.pullFromRemote(adapter.current, { full: true });
          if (stored) mergeLocalSafety(svc.current.state, stored);
          await saveState(svc.current.state);
        } else if (stored) {
          svc.current.replaceState(normalizeState(stored));
          svc.current.state.currentDeviceId = deviceId();
        }
      } catch {
        if (stored) {
          svc.current.replaceState(normalizeState(stored));
          svc.current.state.currentDeviceId = deviceId();
        }
      }
      if (!cancelled) {
        setReady(true);
        persistTick();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [persistTick]);

  useEffect(() => {
    if (!ready) return;
    void flushQueue();
  }, [ready, flushQueue]);

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
  }, [ready, refresh, tick]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp outside provider");
  return ctx;
}
