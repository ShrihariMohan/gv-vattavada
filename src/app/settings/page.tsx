"use client";
import { Screen } from "@/ui/Screen";
import { useApp } from "@/ui/AppProvider";
import { reregisterAppServiceWorker, serviceWorkerStatus, unregisterAppServiceWorker } from "@/pwa/service-worker";
import { backupCsvFiles, backupToJson, parseBackupJson } from "@/domain/backup";
import { useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function downloadFile(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SettingsPage() {
  const { service, refresh, user, syncAdapter, restoreBackup, can } = useApp();
  const [sw, setSw] = useState({ registered: false, disabled: false });
  const [cloudBusy, setCloudBusy] = useState(false);
  const canCloudBackup = can("settings.manage");

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
            <CardTitle>Local backup</CardTitle>
            <CardDescription>
              Snapshot of this device (Dexie): restore POS and stays on the same or another tablet. Use Cloud backup below to copy the shared Postgres database.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const blob = new Blob([backupToJson(service.state)], { type: "application/json" });
                downloadFile(`vbm-backup-${new Date().toISOString().slice(0, 10)}.json`, blob);
                toast.success("JSON backup saved");
              }}
            >
              Download JSON
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                for (const file of backupCsvFiles(service.state)) {
                  downloadFile(file.name, new Blob([file.body], { type: "text/csv" }));
                }
                toast.success("CSV files downloaded");
              }}
            >
              Download CSVs
            </Button>
            <label className={cn(buttonVariants({ variant: "secondary" }), "cursor-pointer")}>
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    const text = await file.text();
                    const incoming = parseBackupJson(text);
                    if (!window.confirm("Replace this device’s local database with the backup? Current unsynced work on this device will be overwritten.")) return;
                    restoreBackup(incoming);
                    toast.success("Backup restored on this device");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Import failed");
                  }
                }}
              />
              Import JSON
            </label>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cloud backup (Postgres)</CardTitle>
            <CardDescription>
              Dexie JSON is this device. The cloud copy lives in Supabase as <span className="font-mono">sync_records</span> JSON.
              Download one <span className="font-mono">.sql</span> file that creates the tables and upserts every row — enough to recreate the database on another Postgres or Supabase project.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <p className="text-sm text-muted-foreground">
              Restore: paste the file into the new project’s SQL editor, or run{" "}
              <span className="font-mono">psql "$DATABASE_URL" -f vbm-supabase.sql</span>. Then point this app at the new URL and service role key.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!canCloudBackup || cloudBusy}
                onClick={async () => {
                  setCloudBusy(true);
                  try {
                    const res = await fetch("/api/sync/export");
                    if (!res.ok) {
                      const err = (await res.json().catch(() => null)) as { error?: string } | null;
                      throw new Error(err?.error ?? `Export failed (${res.status})`);
                    }
                    const blob = await res.blob();
                    const day = new Date().toISOString().slice(0, 10);
                    downloadFile(`vbm-supabase-${day}.sql`, blob);
                    const n = res.headers.get("X-Backup-Sync-Records") ?? "?";
                    toast.success("Cloud SQL saved", { description: `${n} synced records. Store this file on your disk.` });
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Cloud export failed");
                  } finally {
                    setCloudBusy(false);
                  }
                }}
              >
                {cloudBusy ? "Exporting…" : "Download cloud SQL"}
              </Button>
            </div>
            {!canCloudBackup && (
              <p className="text-xs text-muted-foreground">Only an admin can export the full cloud database.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sync</CardTitle>
            <CardDescription>
              Pending: {service.pendingCount()}. Cloud is /api/sync. Other devices receive bills only after a successful pull.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                service.setOnline(true);
                const pushed = await service.processSyncQueue(syncAdapter);
                const pulled = await service.pullFromRemote(syncAdapter, { full: true });
                toast.success(`${pushed.filter((x) => x.ok).length} pushed · ${pulled} pulled`);
                refresh();
              }}
            >
              Sync now
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const res = await fetch("/api/sync?health=1");
                  const info = (await res.json()) as { configured?: boolean; ok?: boolean; error?: string; count?: number };
                  if (!info.configured) toast.error("Supabase not configured", { description: info.error });
                  else if (!info.ok) toast.error("Supabase error", { description: info.error });
                  else toast.success("Supabase connected", { description: `${info.count ?? 0} cloud records` });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Health check failed");
                }
              }}
            >
              Test cloud
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
