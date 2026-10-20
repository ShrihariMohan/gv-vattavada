-- Phase 1: normalized tables next to the legacy `sync_records` JSONB copy.
-- Purely additive: nothing here changes how the current app reads or writes.
--
-- Conventions
--   * Text ids are kept exactly as produced by devices (no remapping).
--   * Money is integer paise (bigint). Business dates are Asia/Kolkata calendar dates.
--   * Every syncable row carries created_at/updated_at/deleted_at/device_id/version and a
--     global `change_seq` assigned by trigger from ONE sequence. Writers are serialized by a
--     transaction-scoped advisory lock taken in the same trigger, so change_seq order equals
--     commit order and a cursor pull can never skip a row that commits late.
--   * `extra` keeps any payload keys that have no column yet, so a round trip is lossless.
--   * Soft deletes for sync; hard deletes only by the archive purge, which leaves a tombstone.

create sequence if not exists public.sync_change_seq as bigint;

-- ---------------------------------------------------------------------------
-- Change sequence + tombstones
-- ---------------------------------------------------------------------------

create table if not exists public.tombstones (
  entity_type text not null,
  entity_id text not null,
  reason text not null check (reason in ('DELETED', 'ARCHIVED')),
  deleted_at timestamptz not null default now(),
  change_seq bigint not null,
  primary key (entity_type, entity_id)
);
create index if not exists tombstones_change_seq on public.tombstones (change_seq);

create or replace function public.sync_lock() returns void
language sql as $$ select pg_advisory_xact_lock(727274001) $$;

create or replace function public.tg_assign_change_seq() returns trigger
language plpgsql as $$
begin
  perform public.sync_lock();
  new.change_seq := nextval('public.sync_change_seq');
  new.synced_at := now();
  return new;
end $$;

create or replace function public.tg_soft_delete_tombstone() returns trigger
language plpgsql as $$
begin
  if new.deleted_at is not null and (tg_op = 'INSERT' or old.deleted_at is null) then
    insert into public.tombstones (entity_type, entity_id, reason, deleted_at, change_seq)
    values (tg_argv[0], new.id, 'DELETED', new.deleted_at, new.change_seq)
    on conflict (entity_type, entity_id) do nothing;
  end if;
  return new;
end $$;

create or replace function public.tg_hard_delete_tombstone() returns trigger
language plpgsql as $$
begin
  perform public.sync_lock();
  insert into public.tombstones (entity_type, entity_id, reason, deleted_at, change_seq)
  values (tg_argv[0], old.id, 'ARCHIVED', now(), nextval('public.sync_change_seq'))
  on conflict (entity_type, entity_id) do update
    set reason = 'ARCHIVED', deleted_at = excluded.deleted_at, change_seq = excluded.change_seq;
  return old;
end $$;

-- ---------------------------------------------------------------------------
-- Entity tables
-- ---------------------------------------------------------------------------

create table if not exists public.customers (
  id text primary key,
  name text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, device_id text, version integer not null default 1,
  extra jsonb not null default '{}'::jsonb, change_seq bigint not null default 0, synced_at timestamptz
);

create table if not exists public.product_categories (
  id text primary key,
  business_id text not null,
  name text not null default '',
  display_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, device_id text, version integer not null default 1,
  extra jsonb not null default '{}'::jsonb, change_seq bigint not null default 0, synced_at timestamptz
);

create table if not exists public.products (
  id text primary key,
  business_id text not null,
  category_id text,
  name text not null default '',
  price_paise bigint not null default 0,
  tax_bps integer not null default 0,
  unit text not null default '',
  sku text not null default '',
  description text not null default '',
  image_url text not null default '',
  tags jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, device_id text, version integer not null default 1,
  extra jsonb not null default '{}'::jsonb, change_seq bigint not null default 0, synced_at timestamptz
);

create table if not exists public.restaurant_tables (
  id text primary key,
  business_id text not null,
  name text not null default '',
  status text not null default 'AVAILABLE',
  current_order_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, device_id text, version integer not null default 1,
  extra jsonb not null default '{}'::jsonb, change_seq bigint not null default 0, synced_at timestamptz
);

create table if not exists public.rooms (
  id text primary key,
  business_id text not null,
  room_type_id text,
  number text not null default '',
  name text not null default '',
  capacity integer not null default 0,
  base_price_paise bigint not null default 0,
  status text not null default 'AVAILABLE',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, device_id text, version integer not null default 1,
  extra jsonb not null default '{}'::jsonb, change_seq bigint not null default 0, synced_at timestamptz
);

create table if not exists public.bookings (
  id text primary key,
  business_id text not null,
  customer_id text,
  room_id text references public.rooms (id) on delete restrict,
  check_in date not null,
  check_out date not null,
  adults integer not null default 0,
  children integer not null default 0,
  rate_paise bigint not null default 0,
  extra_charges_paise bigint not null default 0,
  food_paise bigint not null default 0,
  extra_bed_paise bigint not null default 0,
  activities_paise bigint not null default 0,
  other_income_paise bigint not null default 0,
  discount_paise bigint not null default 0,
  tax_paise bigint not null default 0,
  total_paise bigint not null default 0,
  paid_paise bigint not null default 0,
  balance_paise bigint not null default 0,
  status text not null,
  notes text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, device_id text, version integer not null default 1,
  extra jsonb not null default '{}'::jsonb, change_seq bigint not null default 0, synced_at timestamptz
);

create table if not exists public.orders (
  id text primary key,
  business_id text not null,
  table_id text,
  customer_id text,
  guest_name text not null default '',
  guest_phone text not null default '',
  room_number text not null default '',
  status text not null,
  notes text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, device_id text, version integer not null default 1,
  extra jsonb not null default '{}'::jsonb, change_seq bigint not null default 0, synced_at timestamptz
);

create table if not exists public.order_items (
  id text primary key,
  order_id text not null references public.orders (id) on delete restrict,
  product_id text,
  name text not null default '',
  qty numeric(12, 3) not null default 0,
  unit_price_paise bigint not null default 0,
  tax_bps integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, device_id text, version integer not null default 1,
  extra jsonb not null default '{}'::jsonb, change_seq bigint not null default 0, synced_at timestamptz
);

create table if not exists public.invoices (
  id text primary key,
  business_id text not null,
  customer_id text,
  order_id text references public.orders (id) on delete restrict,
  booking_id text references public.bookings (id) on delete restrict,
  invoice_number text not null default '',
  invoice_type text not null,
  business_date date not null,
  subtotal_paise bigint not null default 0,
  discount_paise bigint not null default 0,
  tax_paise bigint not null default 0,
  total_paise bigint not null default 0,
  paid_amount_paise bigint not null default 0,
  balance_amount_paise bigint not null default 0,
  payment_status text not null default 'UNPAID',
  status text not null default 'ISSUED',
  notes text not null default '',
  legacy_mismatch boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, device_id text, version integer not null default 1,
  extra jsonb not null default '{}'::jsonb, change_seq bigint not null default 0, synced_at timestamptz
);

create table if not exists public.invoice_items (
  id text primary key,
  invoice_id text not null references public.invoices (id) on delete restrict,
  product_id text,
  name text not null default '',
  qty numeric(12, 3) not null default 0,
  unit_price_paise bigint not null default 0,
  amount_paise bigint not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, device_id text, version integer not null default 1,
  extra jsonb not null default '{}'::jsonb, change_seq bigint not null default 0, synced_at timestamptz
);

create table if not exists public.payments (
  id text primary key,
  business_id text not null,
  invoice_id text references public.invoices (id) on delete restrict,
  booking_id text references public.bookings (id) on delete restrict,
  customer_id text,
  amount_paise bigint not null default 0,
  method text not null,
  business_date date not null,
  notes text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, device_id text, version integer not null default 1,
  extra jsonb not null default '{}'::jsonb, change_seq bigint not null default 0, synced_at timestamptz
);

create table if not exists public.expenses (
  id text primary key,
  business_id text not null,
  category text not null default '',
  amount_paise bigint not null default 0,
  payment_method text not null default 'CASH',
  business_date date not null,
  description text not null default '',
  vendor text not null default '',
  attachment text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, device_id text, version integer not null default 1,
  extra jsonb not null default '{}'::jsonb, change_seq bigint not null default 0, synced_at timestamptz
);

create table if not exists public.ledger_entries (
  id text primary key,
  business_id text not null,
  type text not null,
  amount_paise bigint not null default 0,
  business_date date not null,
  description text not null default '',
  ref_id text not null default '',
  ref_type text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, device_id text, version integer not null default 1,
  extra jsonb not null default '{}'::jsonb, change_seq bigint not null default 0, synced_at timestamptz
);

create table if not exists public.daily_closings (
  id text primary key,
  business_id text not null,
  business_date date not null,
  cash_sales_paise bigint not null default 0,
  upi_sales_paise bigint not null default 0,
  card_sales_paise bigint not null default 0,
  expected_cash_paise bigint not null default 0,
  actual_cash_paise bigint not null default 0,
  difference_paise bigint not null default 0,
  closed_by text not null default '',
  status text not null default 'CLOSED',
  reopened_at timestamptz,
  reopen_reason text not null default '',
  -- Two devices can close the same day offline. The latest CLOSED row wins; older ones are
  -- kept (never deleted) and point at the winner here.
  superseded_by text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, device_id text, version integer not null default 1,
  extra jsonb not null default '{}'::jsonb, change_seq bigint not null default 0, synced_at timestamptz
);

create table if not exists public.shifts (
  id text primary key,
  business_id text not null,
  name text not null default '',
  opened_at timestamptz not null,
  closed_at timestamptz,
  opening_cash_paise bigint not null default 0,
  sales_paise bigint not null default 0,
  expenses_paise bigint not null default 0,
  closing_cash_paise bigint,
  difference_paise bigint,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, device_id text, version integer not null default 1,
  extra jsonb not null default '{}'::jsonb, change_seq bigint not null default 0, synced_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Sync bookkeeping
-- ---------------------------------------------------------------------------

-- entity_type (as sent by devices) -> table. Single source of truth for SQL functions.
create table if not exists public.sync_entity_map (
  entity_type text primary key,
  table_name text not null unique,
  apply_rank integer not null,
  financial boolean not null
);
insert into public.sync_entity_map (entity_type, table_name, apply_rank, financial) values
  ('customer', 'customers', 0, false),
  ('product_category', 'product_categories', 0, false),
  ('product', 'products', 1, false),
  ('room', 'rooms', 1, false),
  ('table', 'restaurant_tables', 1, false),
  ('order', 'orders', 2, false),
  ('booking', 'bookings', 2, false),
  ('order_item', 'order_items', 3, false),
  ('invoice', 'invoices', 4, true),
  ('invoice_item', 'invoice_items', 5, true),
  ('payment', 'payments', 6, true),
  ('expense', 'expenses', 6, true),
  ('ledger', 'ledger_entries', 6, true),
  ('daily_closing', 'daily_closings', 7, true),
  ('shift', 'shifts', 7, false)
on conflict (entity_type) do update
  set table_name = excluded.table_name, apply_rank = excluded.apply_rank, financial = excluded.financial;

-- Idempotency: a mutation id is applied at most once, whatever the retries.
create table if not exists public.applied_mutations (
  mutation_id text primary key,
  entity_type text not null,
  entity_id text not null,
  status text not null,
  device_id text,
  applied_at timestamptz not null default now()
);
create index if not exists applied_mutations_applied_at on public.applied_mutations (applied_at);

-- Rows that could not be normalized (orphan parent, bad value). Written in the same transaction
-- as the legacy row, retried automatically when the parent arrives, and reported by reconcile.
create table if not exists public.migration_quarantine (
  entity_type text not null,
  entity_id text not null,
  payload jsonb not null,
  operation text not null,
  device_id text,
  reason text not null,
  attempts integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (entity_type, entity_id)
);

create table if not exists public.migration_checkpoints (
  name text primary key,
  last_rank integer,
  last_entity_type text,
  last_entity_id text,
  processed bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- Per-device acknowledged cursor (observability + stale cursor detection).
create table if not exists public.sync_devices (
  device_id text primary key,
  last_cursor bigint not null default 0,
  last_pull_at timestamptz,
  last_push_at timestamptz,
  client_version text
);

-- Server-side feature flags (read by the API routes; flipping needs no redeploy).
create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  note text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.feature_flags (key, enabled, note) values
  ('dual_write', false, 'Write normalized tables in the same transaction as sync_records'),
  ('normalized_reads', false, 'Serve cursor pulls from normalized tables'),
  ('legacy_writes', true, 'Keep writing sync_records (turn off only after every client uses cursor sync)'),
  ('sql_reports', false, 'Serve dashboard/report numbers from SQL functions')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Triggers + indexes
-- ---------------------------------------------------------------------------

do $$
declare r record;
begin
  for r in select entity_type, table_name from public.sync_entity_map loop
    execute format('drop trigger if exists assign_change_seq on public.%I', r.table_name);
    execute format(
      'create trigger assign_change_seq before insert or update on public.%I
         for each row execute function public.tg_assign_change_seq()', r.table_name);
    execute format('drop trigger if exists soft_delete_tombstone on public.%I', r.table_name);
    execute format(
      'create trigger soft_delete_tombstone after insert or update of deleted_at on public.%I
         for each row execute function public.tg_soft_delete_tombstone(%L)', r.table_name, r.entity_type);
    execute format('drop trigger if exists hard_delete_tombstone on public.%I', r.table_name);
    execute format(
      'create trigger hard_delete_tombstone after delete on public.%I
         for each row execute function public.tg_hard_delete_tombstone(%L)', r.table_name, r.entity_type);
    execute format('create index if not exists %I on public.%I (change_seq)', r.table_name || '_change_seq', r.table_name);
    execute format('alter table public.%I enable row level security', r.table_name);
  end loop;
end $$;

-- Access-pattern indexes (partial on live rows where pages only read live rows).
create index if not exists invoices_issued_by_date on public.invoices (business_id, business_date)
  where deleted_at is null and status = 'ISSUED';
create index if not exists invoices_by_date on public.invoices (business_id, business_date);
create index if not exists invoices_order on public.invoices (order_id) where order_id is not null;
create index if not exists invoices_booking on public.invoices (booking_id) where booking_id is not null;
create index if not exists invoice_items_invoice on public.invoice_items (invoice_id);
create index if not exists invoice_items_product on public.invoice_items (product_id) where product_id is not null;
create index if not exists order_items_order on public.order_items (order_id);
create index if not exists order_items_product on public.order_items (product_id);
create index if not exists payments_by_date on public.payments (business_id, business_date);
create index if not exists payments_invoice on public.payments (invoice_id) where invoice_id is not null;
create index if not exists payments_booking on public.payments (booking_id) where booking_id is not null;
create index if not exists expenses_by_date on public.expenses (business_id, business_date);
create index if not exists ledger_by_date on public.ledger_entries (business_id, business_date);
create index if not exists ledger_ref on public.ledger_entries (ref_id);
create index if not exists orders_by_created on public.orders (business_id, created_at);
create index if not exists orders_by_status on public.orders (business_id, status) where deleted_at is null;
create index if not exists bookings_by_property_dates on public.bookings (business_id, check_in, check_out);
create index if not exists bookings_active on public.bookings (business_id, status)
  where deleted_at is null and status in ('ENQUIRY', 'RESERVED', 'CHECKED_IN');
create index if not exists bookings_room on public.bookings (room_id);
create unique index if not exists daily_closings_one_closed_per_day on public.daily_closings (business_id, business_date)
  where deleted_at is null and status = 'CLOSED' and superseded_by is null;
create index if not exists daily_closings_by_date on public.daily_closings (business_id, business_date);
create index if not exists shifts_by_opened on public.shifts (business_id, opened_at);
create index if not exists products_by_business on public.products (business_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Security: RLS on, anon gets nothing. Server routes use the service role (bypasses RLS).
-- ---------------------------------------------------------------------------

alter table public.tombstones enable row level security;
alter table public.sync_entity_map enable row level security;
alter table public.applied_mutations enable row level security;
alter table public.migration_quarantine enable row level security;
alter table public.migration_checkpoints enable row level security;
alter table public.sync_devices enable row level security;
alter table public.feature_flags enable row level security;

do $$
declare t text;
begin
  for t in
    select unnest(array[
      'customers','product_categories','products','restaurant_tables','rooms','bookings','orders',
      'order_items','invoices','invoice_items','payments','expenses','ledger_entries','daily_closings',
      'shifts','tombstones','sync_entity_map','applied_mutations','migration_quarantine',
      'migration_checkpoints','sync_devices','feature_flags'])
  loop
    execute format('drop policy if exists %I on public.%I', t || '_no_anon', t);
    execute format('create policy %I on public.%I for all to anon, authenticated using (false) with check (false)', t || '_no_anon', t);
  end loop;
end $$;

revoke all on sequence public.sync_change_seq from anon, authenticated;
