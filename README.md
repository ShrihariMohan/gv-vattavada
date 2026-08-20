# Vattavada Business Manager

Offline-first multi-business operations app for two stays and a restaurant.

## Run

```bash
nvm use 22
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Staff login: `admin` / `admin123`. Also `manager`, `staff` (restaurant), `kitchen.manager` / `kitchen123`, `kitchen.staff` / `kstaff123`, `stay.manager` / `stay123`, `stay.staff` / `sstaff123`.

Install as a PWA from the browser (Add to Home Screen). Public pages and the staff shell stay available offline after a first visit. After an app update, use **Settings → Unregister / Re-register** if a stale service worker is serving old JS (IndexedDB is not cleared).

## Supabase (background sync)

1. Create a project at [supabase.com](https://supabase.com).
2. Copy `.env.example` to `.env.local` and fill `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (server only).
3. In the SQL editor run `supabase/schema.sql`, then `supabase/seed.sql`.
4. Set `NEXT_PUBLIC_SYNC_ENABLED=true` and restart `npm run dev`.
5. The Dexie queue posts to `/api/sync` on open, reconnect, every 15s, Sync now, and (where supported) Background Sync. POS still works with no network.

## Architecture

UI → local Dexie/IndexedDB (AppService) → sync queue → optional `/api/sync` or in-memory adapter.

Money is integer **paise**. Timestamps are UTC; business dates use Asia/Kolkata.

Point a future Supabase project at `/api/sync` without changing POS/stay screens.

## Tests

`npm test` runs requirement-mapped cases in `src/domain/requirements.test.ts` (money, offline billing, sync states, POS, stays, finance, roles, conflicts, print layout, occupancy/ADR/RevPAR).
