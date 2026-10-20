"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { adminFetch, getAdminToken, setAdminToken, type ArchiveStatus } from "@/lib/admin-client";
import { ARCHIVE_TABLES, buildArchiveBundle, verifyUploadedBundle, type ArchiveReferences, type ArchiveRows } from "@/lib/archive-bundle";
import { entityDb, entityStoreStatus, setEntityStoreEnabled, type EntityStoreStatus } from "@/db/persist";
import { Repository } from "@/db/repository";
import { addDays, businessDateInKolkata } from "@/domain/dates";
import type { AppService } from "@/domain/service";

type Flags = { dual_write: boolean; normalized_reads: boolean; legacy_writes: boolean; sql_reports: boolean; normalized_schema: boolean };
type Status = {
  flags: Flags;
  database: { database_bytes: number; level: string } | null;
  quarantined: number | null;
  devices: { device_id: string; last_cursor: number; last_pull_at: string | null; last_push_at: string | null; client_version: string | null }[];
  checkpoints: { name: string; processed: number; updated_at: string }[];
  errors: string[];
};
type Reconcile = {
  clean: boolean;
  generated_at: string;
  entities: { entity_type: string; legacy: number; normalized: number; missing: number; extra: number; quarantined: number; deleted_mismatch: number; version_mismatch: number; missing_ids: string[]; extra_ids: string[] }[];
  total_mismatches: unknown[];
  invariants: Record<string, unknown>;
};

const MB = 1024 * 1024;

function download(name: string, data: Uint8Array, mime: string) {
  const url = URL.createObjectURL(new Blob([data.slice().buffer as ArrayBuffer], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

/** Admin-only: storage migration, server dual-write controls, report parity, monthly archive. */
export function AdminMigrationPanel({ service }: { service: AppService }) {
  const [token, setToken] = useState(() => getAdminToken());
  const [local, setLocal] = useState<EntityStoreStatus | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [reconcile, setReconcile] = useState<Reconcile | null>(null);
  const [archive, setArchive] = useState<ArchiveStatus | null>(null);
  const [busy, setBusy] = useState("");
  const [parity, setParity] = useState<{ days: number; mismatches: { date: string; local: number; server: number }[] } | null>(null);
  const [verified, setVerified] = useState<Record<string, boolean>>({});

  const loadServer = useCallback(async () => {
    if (!getAdminToken()) return;
    try {
      setStatus(await adminFetch<Status>("/api/admin/migration?action=status"));
      setArchive(await adminFetch<ArchiveStatus>("/api/admin/archive?action=status"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Admin request failed");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void entityStoreStatus().then((s) => !cancelled && setLocal(s));
    void (async () => {
      if (!getAdminToken()) return;
      try {
        const [st, ar] = await Promise.all([
          adminFetch<Status>("/api/admin/migration?action=status"),
          adminFetch<ArchiveStatus>("/api/admin/archive?action=status"),
        ]);
        if (cancelled) return;
        setStatus(st);
        setArchive(ar);
      } catch {
        /* token missing/wrong: the token field is shown */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusy("");
    }
  };

  const setFlag = (key: keyof Flags, enabled: boolean) =>
    run(`flag ${key}`, async () => {
      if (!window.confirm(`${enabled ? "Enable" : "Disable"} ${key} on the server for every device?`)) return;
      await adminFetch("/api/admin/migration", { method: "POST", body: { action: "set-flag", key, enabled } });
      toast.success(`${key} ${enabled ? "enabled" : "disabled"}`);
      await loadServer();
    });

  const backfill = () =>
    run("backfill", async () => {
      let total = 0;
      for (let i = 0; i < 500; i += 1) {
        const r = await adminFetch<{ processed: number; quarantined: number; done: boolean }>("/api/admin/migration", {
          method: "POST",
          body: { action: "backfill", batch: 500 },
        });
        total += r.processed;
        setBusy(`backfill: ${total} rows`);
        if (r.done) break;
      }
      toast.success(`Backfill finished (${total} rows this run)`);
      await loadServer();
    });

  const runReconcile = () =>
    run("reconcile", async () => {
      const r = await adminFetch<Reconcile>("/api/admin/migration?action=reconcile");
      setReconcile(r);
      toast[r.clean ? "success" : "warning"](r.clean ? "Legacy and normalized data match" : "Differences found (see report)");
    });

  const runParity = () =>
    run("parity", async () => {
      const to = businessDateInKolkata(new Date().toISOString());
      const from = addDays(to, -89);
      const server = await adminFetch<{ by_date: Record<string, number>; revenue: number }>(
        `/api/reports?report=analytics&from=${from}&to=${to}`,
      );
      const localA = service.analytics(from, to);
      const days = new Set([...Object.keys(server.by_date ?? {}), ...Object.keys(localA.byDate)]);
      const mismatches = [...days]
        .map((date) => ({ date, local: localA.byDate[date] ?? 0, server: server.by_date?.[date] ?? 0 }))
        .filter((x) => x.local !== x.server)
        .sort((a, b) => a.date.localeCompare(b.date));
      setParity({ days: days.size, mismatches });
      toast[mismatches.length ? "warning" : "success"](
        mismatches.length ? `${mismatches.length} days differ` : `All ${days.size} days match`,
      );
    });

  const downloadArchive = (month: string) =>
    run(`archive ${month}`, async () => {
      const rows = {} as ArchiveRows;
      for (const table of ARCHIVE_TABLES) {
        rows[table] = [];
        let after = "";
        for (;;) {
          const page = await adminFetch<{ rows: Record<string, unknown>[]; next_after: string | null }>(
            `/api/admin/archive?action=rows&month=${month}&table=${table}&after=${encodeURIComponent(after)}&limit=1000`,
          );
          rows[table].push(...page.rows);
          setBusy(`archive ${month}: ${table} ${rows[table].length}`);
          if (!page.next_after) break;
          after = page.next_after;
        }
      }
      const refs = await adminFetch<ArchiveReferences>(`/api/admin/archive?action=references&month=${month}`);
      const bundle = await buildArchiveBundle(month, rows, refs);
      for (const f of bundle.files) download(f.name, f.data, f.mime);
      const db = entityDb();
      if (db) {
        await new Repository(db).saveArchiveManifest({
          month,
          created_at: bundle.manifest.created_at,
          verified_at: null,
          purged_at: null,
          sha256: Object.fromEntries(bundle.manifest.files.map((f) => [f.name, f.sha256])),
          counts: Object.fromEntries(Object.entries(bundle.manifest.digest).map(([k, v]) => [k, v.count])),
          totals_paise: Object.fromEntries(Object.entries(bundle.manifest.digest).map(([k, v]) => [k, v.total_paise])),
        });
      }
      toast.success(`Downloaded 4 files for ${month}. Keep two copies on separate disks, then re-upload them to verify.`);
    });

  const verifyArchive = (month: string, list: FileList | null) =>
    run(`verify ${month}`, async () => {
      if (!list?.length) return;
      const files = await Promise.all([...list].map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })));
      const local = await verifyUploadedBundle(files, month);
      if (!local.ok) {
        toast.error(local.errors.join("; "));
        return;
      }
      const server = await adminFetch<{ ok: boolean }>("/api/admin/archive", {
        method: "POST",
        body: { action: "verify", month, digest: local.digest, manifest: { files: local.manifest.files, created_at: local.manifest.created_at } },
      });
      if (!server.ok) {
        toast.error("The live data changed or does not match this bundle. Download the month again.");
        return;
      }
      setVerified((v) => ({ ...v, [month]: true }));
      const db = entityDb();
      if (db) {
        const repo = new Repository(db);
        const existing = (await repo.archiveManifests()).find((m) => m.month === month);
        if (existing) await repo.saveArchiveManifest({ ...existing, verified_at: new Date().toISOString() });
      }
      toast.success(`${month} verified. "Archive this month" is now enabled.`);
      await loadServer();
    });

  const purgeMonth = (month: string) =>
    run(`purge ${month}`, async () => {
      if (!window.confirm(`Archive ${month}? Detail rows are deleted from the cloud database; monthly totals stay. Make sure the files are saved in two places.`)) return;
      let remaining = -1;
      for (let i = 0; i < 200 && remaining !== 0; i += 1) {
        const r = await adminFetch<{ remaining: number; deleted: number }>("/api/admin/archive", { method: "POST", body: { action: "archive", month } });
        remaining = r.remaining;
        setBusy(`purge ${month}: ${remaining} left`);
      }
      const db = entityDb();
      if (db) {
        const repo = new Repository(db);
        const existing = (await repo.archiveManifests()).find((m) => m.month === month);
        if (existing) await repo.saveArchiveManifest({ ...existing, purged_at: new Date().toISOString() });
      }
      toast.success(`${month} archived. Run VACUUM ANALYZE in the Supabase SQL editor to return space.`);
      await loadServer();
    });

  const isVerified = (m: string) => verified[m] || Boolean(archive?.verified.some((v) => v.month === m));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data migration &amp; archive (admin)</CardTitle>
        <CardDescription>Normalized cloud tables, cursor sync, server reports and the monthly archive.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 text-sm">
        <section className="grid gap-2">
          <p className="font-medium">This device&apos;s storage</p>
          {local && (
            <p className="text-muted-foreground">
              Mode: <Badge variant="outline">{local.mode === "entity" ? "per-entity stores" : "legacy snapshot"}</Badge>
              {local.migration?.at && <> · migrated {new Date(local.migration.at).toLocaleString()}</>}
              {local.legacyMirrorUntil && <> · rollback copy kept until {new Date(local.legacyMirrorUntil).toLocaleDateString()}</>}
            </p>
          )}
          {local?.failed && <p className="text-destructive">Last migration attempt failed: {local.failed.report.errors.slice(0, 3).join("; ")}</p>}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const next = !(local?.enabled ?? true);
                if (!window.confirm(next ? "Use per-entity storage after reload?" : "Fall back to the legacy snapshot after reload? (rollback)")) return;
                setEntityStoreEnabled(next);
                window.location.reload();
              }}
            >
              {local?.enabled === false ? "Re-enable per-entity storage" : "Use legacy storage (rollback)"}
            </Button>
          </div>
        </section>

        <section className="grid gap-2">
          <p className="font-medium">Admin token</p>
          <div className="flex gap-2">
            <Input type="password" value={token} placeholder="SYNC_ADMIN_TOKEN" onChange={(e) => setToken(e.target.value)} />
            <Button
              size="sm"
              onClick={() => {
                setAdminToken(token.trim());
                void loadServer();
              }}
            >
              Save
            </Button>
          </div>
        </section>

        {status && (
          <section className="grid gap-2">
            <p className="font-medium">Server migration</p>
            {!status.flags.normalized_schema && (
              <p className="text-destructive">Normalized tables are not in the database yet. Apply the Supabase migrations first.</p>
            )}
            {status.database && (
              <p className={status.database.level === "ok" ? "text-muted-foreground" : "font-medium text-destructive"}>
                Database size {(status.database.database_bytes / MB).toFixed(1)} MB of 500 MB
                {status.database.level === "warn" && " — over 300 MB: archive older months soon"}
                {status.database.level === "alert" && " — over 400 MB: archive now (read-only at 500 MB)"}
              </p>
            )}
            <p className="text-muted-foreground">Quarantined rows: {status.quarantined ?? "–"} · Devices seen: {status.devices.length}</p>
            <div className="grid grid-cols-2 gap-2">
              {(["dual_write", "normalized_reads", "sql_reports", "legacy_writes"] as const).map((k) => (
                <Button key={k} size="sm" variant={status.flags[k] ? "default" : "outline"} disabled={!!busy} onClick={() => setFlag(k, !status.flags[k])}>
                  {k}: {status.flags[k] ? "on" : "off"}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={!!busy} onClick={backfill}>Run backfill</Button>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={runReconcile}>Reconcile</Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy}
                onClick={() => run("retry", async () => {
                  const r = await adminFetch<{ fixed: number; remaining: number }>("/api/admin/migration", { method: "POST", body: { action: "retry-quarantine" } });
                  toast.success(`Fixed ${r.fixed}, ${r.remaining} still quarantined`);
                  await loadServer();
                })}
              >
                Retry quarantine
              </Button>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={runParity}>Check report parity (90 days)</Button>
            </div>
            {reconcile && (
              <div className="rounded border p-2">
                <p className={reconcile.clean ? "text-emerald-600" : "text-destructive"}>
                  {reconcile.clean ? "Clean: counts, ids, deletes, versions and totals match" : "Not clean"} · {new Date(reconcile.generated_at).toLocaleString()}
                </p>
                {reconcile.entities
                  .filter((e) => e.missing || e.extra || e.quarantined || e.deleted_mismatch || e.version_mismatch)
                  .map((e) => (
                    <p key={e.entity_type} className="font-mono text-xs">
                      {e.entity_type}: legacy {e.legacy} / normalized {e.normalized} · missing {e.missing} · extra {e.extra} · quarantined {e.quarantined}
                      {e.missing_ids.length ? ` · e.g. ${e.missing_ids.slice(0, 3).join(", ")}` : ""}
                    </p>
                  ))}
                {reconcile.total_mismatches.length > 0 && <p className="text-xs">Totals differ in {reconcile.total_mismatches.length} business-months.</p>}
                <p className="text-xs text-muted-foreground">Flagged legacy invoices: {String(reconcile.invariants.invoice_mismatches ?? 0)}</p>
              </div>
            )}
            {parity && (
              <p className={parity.mismatches.length ? "text-destructive" : "text-emerald-600"}>
                Report parity: {parity.days - parity.mismatches.length}/{parity.days} days match
                {parity.mismatches.slice(0, 5).map((m) => ` · ${m.date}: local ${m.local} vs server ${m.server}`)}
              </p>
            )}
          </section>
        )}

        {archive && (
          <section className="grid gap-2">
            <p className="font-medium">Monthly archive</p>
            <p className="text-muted-foreground">
              Live detail is kept from {archive.retention_floor} onward. Older months are archived to files you keep (two copies, separate disks).
            </p>
            {archive.pending.length === 0 && <p className="text-muted-foreground">No months waiting to be archived.</p>}
            {archive.pending.map((m) => (
              <div key={m} className="flex flex-wrap items-center gap-2 rounded border p-2">
                <Badge variant="destructive">{m}</Badge>
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => downloadArchive(m)}>Download archive</Button>
                <label className="cursor-pointer text-xs underline">
                  Verify re-upload
                  <input type="file" multiple className="hidden" accept=".json,.sql,.xlsx" onChange={(e) => verifyArchive(m, e.target.files)} />
                </label>
                <Button size="sm" disabled={!!busy || !isVerified(m)} onClick={() => purgeMonth(m)}>Archive this month</Button>
              </div>
            ))}
            {archive.archived.length > 0 && (
              <p className="text-xs text-muted-foreground">Archived: {archive.archived.map((a) => a.month).join(", ")}</p>
            )}
          </section>
        )}
        {busy && <p className="text-xs text-muted-foreground">Working: {busy}…</p>}
      </CardContent>
    </Card>
  );
}
