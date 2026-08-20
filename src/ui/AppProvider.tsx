"use client";

import { createSeedState } from "@/domain/seed";
import { AppService, MemorySupabaseAdapter } from "@/domain/service";
import type { AppState, Role, User } from "@/domain/types";
import { loadState, saveState } from "@/db/persist";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Ctx = {
  ready: boolean;
  service: AppService;
  user: User | null;
  refresh: () => void;
  login: (u: string, p: string) => void;
  logout: () => void;
  can: (action: Parameters<AppService["require"]>[0]) => boolean;
};

const AppCtx = createContext<Ctx | null>(null);

function deviceId() {
  if (typeof window === "undefined") return "DEVICE-RESTAURANT-TABLET-01";
  const key = "vbm-device-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = "DEVICE-RESTAURANT-TABLET-01";
    localStorage.setItem(key, id);
  }
  return id;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const svc = useRef<AppService | null>(null);
  const adapter = useRef(new MemorySupabaseAdapter());

  const refresh = useCallback(() => {
    if (svc.current) void saveState(svc.current.state);
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadState();
      const state: AppState = stored ?? createSeedState(deviceId());
      state.currentDeviceId = deviceId();
      state.online = navigator.onLine;
      if (!cancelled) {
        svc.current = new AppService(state);
        setReady(true);
        refresh();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    const on = () => {
      if (!svc.current) return;
      svc.current.setOnline(true);
      svc.current.processSyncQueue(adapter.current);
      refresh();
    };
    const off = () => {
      svc.current?.setOnline(false);
      refresh();
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const t = window.setInterval(() => {
      if (svc.current?.state.online) {
        svc.current.processSyncQueue(adapter.current);
        refresh();
      }
    }, 15000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.clearInterval(t);
    };
  }, [refresh]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  const value = useMemo(() => {
    const service = svc.current ?? new AppService(createSeedState(deviceId()));
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
    };
  }, [ready, refresh, tick]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp outside provider");
  return ctx;
}
