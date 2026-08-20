# Vattavada Business Manager

Offline-first multi-business operations app for two stays and a restaurant.

## Run

```bash
nvm use 22
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in with `admin` / `admin123` (also `manager` / `manager123`, `staff` / `staff123`).

Install as a PWA from the browser (Add to Home Screen).

## Architecture

UI → local Dexie/IndexedDB (AppService) → sync queue → optional `/api/sync` or in-memory adapter.

Money is integer **paise**. Timestamps are UTC; business dates use Asia/Kolkata.

Point a future Supabase project at `/api/sync` without changing POS/stay screens.

## Tests

`npm test` runs requirement-mapped cases in `src/domain/requirements.test.ts` (money, offline billing, sync states, POS, stays, finance, roles, conflicts, print layout, occupancy/ADR/RevPAR).
