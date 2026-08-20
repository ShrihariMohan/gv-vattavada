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




Since I am using a free supabase , have an export option to locally export the database or sync data to a local file. This can be done by implementing a feature in the app that allows users to download their data in a common format (like CSV or JSON) for backup purposes in settings page. This way, users can have a local copy of their data even if they are using the free tier of Supabase, which may have limitations on data retention or export capabilities. I can also use this to import data back into the app if needed by increasing the server capacity or switching to a paid plan.


I have added photos inside public folder, so that they can be accessed directly via URL. This is useful for static assets that need to be served quickly and efficiently. Make sure to reference these images correctly in your app to ensure they load properly, in the public sites for the 3 business . Gv cloudy glenn resory , fv royal residency and cloudy kitchen. Please go through the images and ensure they are optimized for web use (compressed, appropriate dimensions) to enhance performance and user experience. Create Gallery for Glenn resort. I will add more photos to the public folder as needed, and you can update the gallery accordingly.

The POS screen should be designed to be user-friendly and efficient for staff to use. It should allow for quick order taking, easy navigation between different menu items, and clear visibility of the current order. Implement features like search functionality, category filters, and a clear display of item prices and descriptions. Additionally, ensure that the POS screen is responsive and works well on different devices, including tablets and desktops. Instead of showing bill seperatley show the count in the POS items grid itself. Cancel button is not working in that POS screen, please fix it so that staff can cancel orders easily. Also, implement a feature to allow staff to edit or modify existing orders before finalizing the bill. This will help in reducing errors and improving customer satisfaction.

In the public sites 
Restaurant adress urkadu vattavada munnar 
 Phone number is +918608933892,+918754504478,8838267578
Gv royal residency kovilloor bustand munnar +918608933892,8838267578
Cloudy glenn Resort , vattavada munnar pincode same for all 3 business. Please make sure these details are correctly displayed on the respective public sites for each business.


Pre Seed these products 

Breakfast

1 plate idly - 50rs 
1 set thattu dosa - 50rs
1 set poori - 60rs 
plain dosa - 70rs
ghee dosa - 80rs
masala dosa - 90rs
egg dosa - 80rs
parotta 1 piece - 15 rs 
1 chappathi - 15rs
kadala curry - 60
green peas curry - 60
egg curry - 60
chicken curry - 140
beef curry - 180
half boil  - 40
omelete - 40
kalaki - 40

lunch : 

kerala meals - 140
tamilnadu meals - 140
chicken briyani - 180 
beef briyani - 220
chicken rice - 180
beef rice - 220
chicken noodles - 180
beef noodles - 220
chicken 65 quarter - 240
chicken 65 half - 360
chicken 65 full - 700
chilly chicken - 200
chicken kondattam - 200
pepper chicken - 200
beef  roast - 240
beef fry - 240
fish fry - 100
ghee rice - 120
veg rice - 140
veg noodles - 140
chili gobi - 140 
gobi 65  - 140

water bottle - 20
coke - 35
7up - 35
sprite - 35
miranda - 35
soda - 20rs
