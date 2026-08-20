# Operations requirements addendum (R76–R80)

These requirements extend the original product spec. They are implemented in the app; this file is the source of truth for the new behaviour.

## R76 — Re-open a closed business day

Daily closing must be reversible by an authorised manager.

* Closing a day still locks new POS bills for that **business date** (Asia/Kolkata).
* Cash figures remain editable (correction) while the day is **CLOSED**.
* **Re-open day** sets the closing record to `REOPENED`, writes an audit log, and queues an `UPDATE` for sync.
* After re-open, staff may take new bills again for that date.
* Re-opening must not hard-delete the closing row (financial history).
* Only `ADMIN`, `MANAGER`, or `RESTAURANT_MANAGER` may close or re-open a restaurant day (`day.close`).

## R77 — Stay-specific and restaurant-specific roles

| Role | Intended use | POS / products / day close | Stays / rooms / check-in | Financial analytics |
| --- | --- | --- | --- | --- |
| `ADMIN` | Owner | Yes | Yes | Yes |
| `MANAGER` | General manager (both) | Yes | Yes | Yes |
| `STAFF` | Legacy restaurant floor | POS + view products | No | No |
| `RESTAURANT_MANAGER` | Cloudy Kitchen manager | Yes | No | Yes |
| `RESTAURANT_STAFF` | Cloudy Kitchen floor | POS + view products | No | No |
| `STAY_MANAGER` | Royal Residency / Cloudy Glenn manager | No | Yes | Yes |
| `STAY_STAFF` | Stay front desk | No | Yes (bookings, check-in) | No |

Seed logins (password hash, never plaintext in the DB):

* `admin` / `admin123`
* `manager` / `manager123`
* `staff` / `staff123` (restaurant staff)
* `kitchen.manager` / `kitchen123`
* `kitchen.staff` / `kstaff123`
* `stay.manager` / `stay123`
* `stay.staff` / `sstaff123`

## R78 — Supabase configuration, seed, and background sync

Canonical cloud database is **Supabase PostgreSQL**. The device Dexie DB remains the first write.

### Configure

1. Create a project at [supabase.com](https://supabase.com).
2. Copy URL and **service role** key (server only) and anon key.
3. Put them in `.env.local` (see `.env.example`).
4. In the SQL editor, run `supabase/schema.sql` then `supabase/seed.sql`.
5. Restart `npm run dev`. When `NEXT_PUBLIC_SYNC_ENABLED=true` and the URL is set, the sync engine posts the queue to `/api/sync`, which upserts into `sync_records`.

### Background sync (must not rely on Background Sync API alone)

1. Flush the queue immediately when a write happens and the browser is online.
2. Flush when the app opens.
3. Flush on `online` / reconnect.
4. Flush on a timer while the app is open (~15s).
5. Ask the service worker to register `sync` / `periodicsync` **where supported**; if the app is fully closed, sync may wait until the next open.

Local bills must still succeed with no network.

## R79 — Service worker must not trap schema or JS updates

IndexedDB/Dexie schema lives **outside** the service worker cache.

* Hashed `/_next/` assets use **network-first** so deploys are not stuck on old JS.
* `/api/*` is never cached.
* Settings must expose **Unregister service worker** (clears caches; does not wipe Dexie) and **Re-register service worker**.
* Unregister persists until the user re-registers (flag in `localStorage`).
* After a release, users can re-register to pick up a new cache version (`vbm-shell-v3` and later).

## R80 — Offline-capable website

The public marketing pages and the staff console shell must load when the network drops after a prior visit.

* Precache home, the four public sites, login, dashboard, POS, and `/offline.html`.
* Navigations: network-first, then cache, then `/offline.html`.
* Dexie remains the operational store for POS/stays while offline.
* The header continues to show Online/Offline and pending sync count.
