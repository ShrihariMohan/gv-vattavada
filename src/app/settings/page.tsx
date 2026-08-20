"use client";
import { Screen } from "@/ui/Screen";
import { useApp } from "@/ui/AppProvider";
import { reregisterAppServiceWorker, serviceWorkerStatus, unregisterAppServiceWorker } from "@/pwa/service-worker";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function SettingsPage() {
  const { service, refresh, user, syncAdapter } = useApp();
  const [sw, setSw] = useState({ registered: false, disabled: false });

  const loadSw = async () => {
    setSw(await serviceWorkerStatus());
  };

  useEffect(() => {
    void loadSw();
  }, []);

  return (
    <Screen title="Settings">
      <div className="grid max-w-xl gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Device</CardTitle>
            <CardDescription>Every offline write is tagged with this id.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="font-mono">{service.state.currentDeviceId}</p>
            <p className="mt-1 text-muted-foreground">{user?.name} · {user?.role}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sync</CardTitle>
            <CardDescription>{service.pendingCount()} change(s) waiting. Cloud ingest is /api/sync when enabled.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={async () => {
                service.setOnline(true);
                const r = await service.processSyncQueue(syncAdapter);
                toast.success(`${r.filter((x) => x.ok).length} synced`);
                refresh();
              }}
            >
              Sync now
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Service worker</CardTitle>
            <CardDescription>
              Cached pages must not trap old JavaScript after a schema or app update. Unregister clears caches only — Dexie data stays on this device.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <p className="w-full text-sm text-muted-foreground">
              {sw.disabled ? "Disabled (will not auto-register)" : sw.registered ? "Registered (vbm-shell-v3)" : "Not registered"}
            </p>
            <Button
              variant="outline"
              onClick={async () => {
                await unregisterAppServiceWorker();
                await loadSw();
                toast.success("Service worker unregistered", { description: "Caches cleared. Local database kept." });
              }}
            >
              Unregister
            </Button>
            <Button
              onClick={async () => {
                await reregisterAppServiceWorker();
                await loadSw();
                toast.success("Service worker re-registered");
              }}
            >
              Re-register
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Businesses</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <ul className="space-y-1">
              {service.state.businesses.map((b) => (
                <li key={b.id}>{b.code} · {b.name} · {b.type}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <CardDescription>Passwords are hashed, never stored in plaintext.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {service.state.users.map((u) => (
              <p key={u.id}>{u.username} · {u.role}</p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Conflicts</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {service.state.conflicts.length === 0 && <p className="text-muted-foreground">None</p>}
            {service.state.conflicts.map((c) => (
              <div key={c.id} className="mt-2 border-t pt-2">
                {c.entity_type} {c.resolved ? "resolved" : "This record was modified on another device."}
                {!c.resolved && user?.role === "ADMIN" && (
                  <Button size="sm" variant="outline" className="ml-2" onClick={() => { service.resolveConflict(c.id, "local"); refresh(); }}>
                    Keep local
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">PWA: use Install / Add to Home Screen. Background Sync is optional; the app also flushes the queue on open, online, and every 15s.</p>
      </div>
    </Screen>
  );
}
