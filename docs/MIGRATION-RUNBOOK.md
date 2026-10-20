# Scalable data migration runbook

This runbook implements `plan-for-migration.v1-original.md`, a reversible dual-write rollout with no required downtime. Every step can be undone by flipping a flag back. Nothing in the rollback window drops a populated table.

## What shipped

| Area | Where |
| --- | --- |
| Normalized tables, `change_seq`, tombstones, RLS | `supabase/migrations/20261020000100_normalized_schema.sql` |
| Dual-write, backfill, quarantine, reconcile, cursor pull | `supabase/migrations/20261020000200_sync_functions.sql` |
| SQL analytics and permanent monthly summaries | `supabase/migrations/20261020000300_analytics.sql` |
| Monthly archive, verify, purge, DB size | `supabase/migrations/20261020000400_archive_retention.sql` |
| Sync API (batch push, cursor pull, legacy fallback) | `src/app/api/sync/route.ts` |
| Admin API (status, backfill, reconcile, flags) | `src/app/api/admin/migration/route.ts` |
| Reports API (one RPC per screen) | `src/app/api/reports/route.ts` |
| Archive API | `src/app/api/admin/archive/route.ts` |
| Per-entity Dexie stores, migration, incremental writes | `src/db/entity-store.ts`, `src/db/persist.ts`, `src/db/repository.ts` |
| Batch outbox, cursor pulls, pruning, ledger sync | `src/domain/service.ts` |
| Non-blocking startup, sync progress | `src/ui/AppProvider.tsx`, `src/ui/Shell.tsx` |
| Admin panel (Settings) and dashboard reminder | `src/ui/admin-migration-panel.tsx`, `src/app/dashboard/page.tsx` |
| Archive bundle (XLSX, SQL, JSON, manifest) | `src/lib/archive-bundle.ts` |
| Phase 0 tooling | `scripts/migration/*` |

## Server feature flags

The flags live in `public.feature_flags`. They can be flipped from Settings, under "Data migration & archive", without a redeploy.

| Flag | Default | Meaning |
| --- | --- | --- |
| `dual_write` | off | Each push writes `sync_records` and the normalized tables in the same transaction. |
| `normalized_reads` | off | `/api/sync?after=` serves cursor pulls. Clients fall back to the legacy pull while this is off. |
| `sql_reports` | off | The dashboard uses SQL totals on devices that hold the admin token. |
| `legacy_writes` | on | Keep writing `sync_records`. Turn it off only after every device reports the new client version. |

`SYNC_FORCE_LEGACY=true` (an env var on Vercel) overrides every flag, and the server then behaves exactly like the old app.

## Environment

Add these to Vercel (Production and Preview):

- `SYNC_ADMIN_TOKEN`: at least 16 random characters, for example from `openssl rand -hex 24`.
- `SYNC_FORCE_LEGACY=false`

## Phase 0: baseline, backup, restore rehearsal (no changes)

```bash
DAY=$(date +%F); mkdir -p backups/$DAY
export PROD_DB_URL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres'   # Supabase → Connect → Session pooler

psql "$PROD_DB_URL" -At -f scripts/migration/phase0-baseline.sql > backups/$DAY/baseline-prod.json
psql "$PROD_DB_URL" -At -f scripts/migration/phase0-audit.sql    > backups/$DAY/audit-prod.json   # orphans, duplicates, bad totals
supabase db dump --db-url "$PROD_DB_URL" -f backups/$DAY/schema.sql
supabase db dump --db-url "$PROD_DB_URL" --data-only -f backups/$DAY/data.sql
curl -o backups/$DAY/cloud-export.sql https://<site>/api/sync/export          # existing export route
# On every active device: Settings → Local backup → Download JSON → copy into backups/$DAY/

node scripts/migration/manifest.mjs --out backups/$DAY/manifest.json \
  --baseline backups/$DAY/baseline-prod.json --device office-pc backups/$DAY/*.sql backups/$DAY/*.json

# Restore into a local Postgres and prove counts + totals match exactly (exit code 1 = stop)
DB_URL=postgres://postgres:postgres@localhost:5432 scripts/migration/restore-rehearsal.sh backups/$DAY
```

Keep `backups/$DAY` on two separate disks. This is checkpoint `v1-json-sync`: keep it until 30 days after cutover.

Read `audit-prod.json` before going further. Orphans will be quarantined, not lost. Invoices with wrong totals are imported as they are and flagged. Duplicate closed days keep the latest row, and the older one points to it in `superseded_by`.

## Phase 1: additive schema

```bash
supabase link --project-ref <ref>
supabase migration repair --status applied 20261020000000   # legacy baseline already exists
supabase db push                                            # applies 0100..0400
```

To verify, open the app. Nothing should behave differently, because every flag is off.

## Phase 2: deploy the server, backfill, reconcile

1. Deploy this branch to Vercel. Old clients keep working, because the API accepts their one-item pushes and timestamp pulls.
2. Open Settings → Data migration & archive, paste the admin token, then click **Run backfill** until it reports done, then **Reconcile**.
3. Fix anything listed: missing IDs, quarantined rows (the reason is shown), or total mismatches. Click **Retry quarantine** after a parent row arrives.
4. Turn on `dual_write`. Reconcile daily. Keep legacy reads active until reconcile has been clean for **7 consecutive days**.

## Phase 3: client storage migration

The new client copies the old `primary` snapshot into per-entity stores on its first launch, in a separate IndexedDB database, and validates counts, IDs, money totals and the pending outbox. It never clears or upgrades the legacy database, and it mirrors state back into the legacy snapshot every 5 minutes for 30 days so the previous client still works after a rollback. If validation fails, the device keeps running on the legacy snapshot and the error appears in Settings.

For the canary, open the new build on a non-primary device first, using a copy of production data. Then use it on one production device and compare its Reconcile and dashboard figures after every sync.

Device-level rollback is in Settings: **Use legacy storage (rollback)**.

## Phase 4: cursor sync

After 7 clean canary days, turn on `normalized_reads`. Clients switch to `/api/sync?after=<change_seq>` automatically (batches of 500). Pushes are already batched: up to 100 mutations or 512 KB, each with an idempotent `mutation_id`. Settings → status lists each device's acknowledged cursor.

Once every device shows `client_version` = `2.0.0-cursor-sync`, turn off `legacy_writes`. Keep `sync_records` read-only for 30 days, then export it and drop it.

## Phase 5: SQL reports

Click **Check report parity (90 days)**. Turn on `sql_reports` only when every day in the overlap matches. Expected differences:

- Hour-of-day is now Asia/Kolkata. The old local report used UTC hours.
- Soft-deleted invoices are excluded everywhere. The old dashboard tile included them.

## Phase 6: monthly archive

Start archiving only after one successful export, a re-upload validation, a local restore rehearsal, and 30 stable production days.

1. The dashboard shows a reminder when a month falls outside the current month and the previous two.
2. Go to Settings → **Download archive**. This downloads four files: `.xlsx`, `.sql`, `.json` and `.manifest.json`. Save them on two disks.
3. Click **Verify re-upload** and select all four files. The browser checks the SHA-256 hashes and recomputes the digest, and the server compares that digest with the live data.
4. Click **Archive this month**. Monthly summaries are written first, then detail rows are deleted in bounded batches (children before parents). Rows still referenced by newer data are carried over.
5. In the Supabase SQL editor, run:
   `vacuum analyze public.invoices, public.invoice_items, public.payments, public.ledger_entries, public.expenses, public.orders, public.order_items, public.bookings;`

To restore an archive, run `psql "$DB_URL" -v ON_ERROR_STOP=1 -f vbm-archive-YYYY-MM.sql`. The dump is idempotent (`ON CONFLICT DO NOTHING`).

Settings shows the database size, with a warning at 300 MB and an alert at 400 MB. Supabase Free becomes read-only at 500 MB.

## Rollback (any time in the 30-day window)

1. In Settings, turn off `normalized_reads` and `dual_write`, or set `SYNC_FORCE_LEGACY=true` in Vercel.
2. Redeploy the previous client if needed. Devices reopen the legacy IndexedDB snapshot, which has been mirrored every 5 minutes, and re-pull from `sync_records`.
3. Never drop the normalized tables during the window. They stay unused and harmless.

## Verification commands

```bash
npm test                    # unit + IndexedDB migration + batch/cursor sync + archive bundle tests
npm run test:sql            # SQL integration tests on a throwaway local Postgres (DB_URL)
BASE=https://<site> ADMIN=<token> npm run migration:e2e   # API walk-through (use a staging project!)
```
