-- Run in the Supabase SQL editor before seed.sql.
-- Dexie on each device remains the first write; this table is the cloud copy of the queue.

create table if not exists public.sync_records (
  entity_type text not null,
  entity_id text not null,
  operation text not null,
  payload jsonb not null default '{}'::jsonb,
  device_id text,
  updated_at timestamptz not null default now(),
  primary key (entity_type, entity_id)
);

create index if not exists sync_records_updated_at on public.sync_records (updated_at);

create table if not exists public.businesses (
  id text primary key,
  code text unique not null,
  name text not null,
  type text not null check (type in ('STAY', 'RESTAURANT')),
  email text,
  created_at timestamptz not null default now()
);

alter table public.sync_records enable row level security;
alter table public.businesses enable row level security;

drop policy if exists "sync_records_no_anon" on public.sync_records;
drop policy if exists "businesses_read_anon" on public.businesses;

-- Client never writes with the anon key. The Next.js /api/sync route uses the service role (bypasses RLS).
create policy "sync_records_no_anon" on public.sync_records
  for all using (false) with check (false);

create policy "businesses_read_anon" on public.businesses
  for select using (true);
