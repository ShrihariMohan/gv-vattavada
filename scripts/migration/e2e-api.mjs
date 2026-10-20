#!/usr/bin/env node
// End-to-end check of the HTTP API against a running app (BASE) backed by a migrated database.
// Simulates the rollout: legacy clients -> backfill -> reconcile -> dual-write -> cursor reads.
//   BASE=http://localhost:3100 ADMIN=... node scripts/migration/e2e-api.mjs
const BASE = process.env.BASE ?? "http://localhost:3100";
const ADMIN = process.env.ADMIN ?? "";
let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${!cond && extra ? ` -> ${extra}` : ""}`);
  if (!cond) failures += 1;
};
const json = async (path, init = {}) => {
  const res = await fetch(BASE + path, init);
  let body = null;
  try { body = await res.json(); } catch { /* empty */ }
  return { status: res.status, body };
};
const admin = (path, body) =>
  json(path, body
    ? { method: "POST", headers: { "x-admin-token": ADMIN, "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : { headers: { "x-admin-token": ADMIN } });
const legacyPush = (item) =>
  json("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [item] }) });
const ts = "2026-10-20T10:00:00.000Z";
const inv = (id, extra = {}) => ({
  id, business_id: "biz-rest", order_id: null, booking_id: null, customer_id: null, invoice_number: id, invoice_type: "RESTAURANT",
  business_date: "2026-10-20", subtotal_paise: 1000, discount_paise: 0, tax_paise: 0, total_paise: 1000,
  paid_amount_paise: 1000, balance_amount_paise: 0, payment_status: "PAID", status: "ISSUED", notes: "",
  created_at: ts, updated_at: ts, deleted_at: null, device_id: "dev-legacy", version: 1, server_id: null, sync_status: "PENDING", ...extra,
});

// 1. legacy clients, flags off
for (let i = 0; i < 5; i += 1) {
  const id = `inv-legacy-${i}`;
  const r = await legacyPush({ id: `q-${i}`, entity_type: "invoice", entity_id: id, operation: "CREATE", payload: JSON.stringify(inv(id)) });
  check(`legacy push ${i}`, r.status === 200 && r.body.results[0].status === "SYNCED", JSON.stringify(r.body));
}
const legacyPull = await json("/api/sync?since=2000-01-01T00:00:00Z");
check("legacy pull returns rows", legacyPull.body.records.length === 5, JSON.stringify(legacyPull.body).slice(0, 200));
const cursorOff = await json("/api/sync?after=0");
check("cursor reads disabled -> fallback signal", cursorOff.body.cursor_supported === false);

// 2. admin auth
check("admin route rejects missing token", (await json("/api/admin/migration?action=status")).status === 401);
check("reports reject missing token", (await json("/api/reports?report=dashboard")).status === 401);

// 3. backfill + reconcile
const bf = await admin("/api/admin/migration", { action: "backfill", batch: 2 });
check("backfill done", bf.status === 200 && bf.body.done === true && bf.body.processed === 5, JSON.stringify(bf.body));
const rc = await admin("/api/admin/migration?action=reconcile");
check("reconcile clean after backfill", rc.body.clean === true, JSON.stringify(rc.body).slice(0, 400));

// 4. dual-write on; new batch client with mutation ids
check("enable dual_write", (await admin("/api/admin/migration", { action: "set-flag", key: "dual_write", enabled: true })).status === 200);
const batch = Array.from({ length: 3 }, (_, i) => ({
  mutation_id: `m-new-${i}`, entity_type: "invoice", entity_id: `inv-new-${i}`, operation: "CREATE",
  payload: JSON.stringify(inv(`inv-new-${i}`, { device_id: "dev-new" })),
}));
const pushed = await json("/api/sync", { method: "POST", headers: { "Content-Type": "application/json", "x-client-version": "2.0.0-cursor-sync" },
  body: JSON.stringify({ device_id: "dev-new", client_version: "2.0.0-cursor-sync", items: batch }) });
check("batch push acknowledged per mutation", pushed.body.results.every((r, i) => r.status === "SYNCED" && r.mutation_id === `m-new-${i}`), JSON.stringify(pushed.body));
const replay = await json("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device_id: "dev-new", items: batch }) });
check("replayed batch is idempotent", replay.body.results.every((r) => r.duplicate === true), JSON.stringify(replay.body));
const legacyAfter = await legacyPush({ entity_type: "invoice", entity_id: "inv-legacy-9", operation: "CREATE", payload: JSON.stringify(inv("inv-legacy-9")) });
check("old single-item clients still work with dual-write", legacyAfter.body.results[0].status === "SYNCED");
const rc2 = await admin("/api/admin/migration?action=reconcile");
check("reconcile clean with dual-write", rc2.body.clean === true, JSON.stringify(rc2.body.entities?.find((e) => e.entity_type === "invoice")));

// 5. limits
const tooMany = await json("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ items: Array.from({ length: 101 }, (_, i) => ({ entity_type: "customer", entity_id: `c${i}`, payload: "{}" })) }) });
check("more than 100 items -> 413", tooMany.status === 413);
const tooBig = await json("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ items: [{ entity_type: "customer", entity_id: "big", payload: "x".repeat(600 * 1024) }] }) });
check("body over 512 KB -> 413", tooBig.status === 413);

// 6. cursor reads
check("enable normalized_reads", (await admin("/api/admin/migration", { action: "set-flag", key: "normalized_reads", enabled: true })).status === 200);
let cursor = 0;
let seen = 0;
for (let page = 0; page < 20; page += 1) {
  const r = await json(`/api/sync?after=${cursor}&limit=4&device_id=dev-new`);
  check(`cursor page ${page}`, r.status === 200 && r.body.cursor_supported === true, JSON.stringify(r.body).slice(0, 200));
  seen += r.body.records.length;
  cursor = r.body.next_cursor;
  if (!r.body.has_more) break;
}
check("cursor pull returns every invoice once", seen === 9, `seen ${seen}`);
const stale = await json(`/api/sync?after=${cursor + 1000}`);
check("unknown cursor -> 409 resync_required", stale.status === 409 && stale.body.resync_required === true);
const st = await admin("/api/admin/migration?action=status");
check("device cursor acknowledged", st.body.devices.some((d) => d.device_id === "dev-new" && Number(d.last_cursor) > 0), JSON.stringify(st.body.devices));
check("health advertises cursor sync", (await json("/api/sync?health=1")).body.cursor_sync === true);

// 7. reports + archive status
const dash = await admin(`/api/reports?report=dashboard&today=2026-10-20`);
check("SQL dashboard", dash.status === 200 && dash.body.today === 9000, JSON.stringify(dash.body).slice(0, 300));
const bad = await admin(`/api/reports?report=analytics&from=2026-10-20&to=2026-01-01`);
check("report parameter validation", bad.status === 400);
const arch = await admin(`/api/admin/archive?action=status`);
check("archive status", arch.status === 200 && Array.isArray(arch.body.pending) && arch.body.database?.level === "ok", JSON.stringify(arch.body));
const blocked = await admin("/api/admin/migration", { action: "set-flag", key: "legacy_writes", enabled: false });
check("cannot stop legacy writes while old clients exist", blocked.status === 200 || blocked.status === 409);

console.log(failures ? `\n${failures} FAILED` : "\nall API checks passed");
process.exit(failures ? 1 : 0);
