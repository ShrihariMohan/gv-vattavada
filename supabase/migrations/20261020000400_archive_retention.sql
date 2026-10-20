-- Phase 6: free-tier monthly archive + retention.
--
-- Flow (all driven by an admin in Settings; no cron):
--   1. archive_month_rows      page through one month's detail -> browser builds XLSX + SQL + JSON + manifest
--   2. admin re-uploads the files -> browser checks SHA-256 and recomputes the content digest
--   3. archive_verify          server compares that digest with its own; stores the verification
--   4. archive_begin           re-checks digest is unchanged, writes permanent monthly summaries,
--                              marks the month archived (reports switch to summaries)
--   5. archive_purge_step      deletes detail children-before-parents in bounded batches
--   6. VACUUM ANALYZE          run manually in the SQL editor as the approved maintenance step
-- A month is eligible only if it is older than the current month and the previous two
-- (Asia/Kolkata), and rows still referenced by newer retained rows are carried over, not deleted.

create table if not exists public.archive_verifications (
  month text primary key check (month ~ '^\d{4}-\d{2}$'),
  verified_at timestamptz not null default now(),
  digest jsonb not null,
  manifest jsonb not null
);
alter table public.archive_verifications enable row level security;
drop policy if exists archive_verifications_no_anon on public.archive_verifications;
create policy archive_verifications_no_anon on public.archive_verifications for all to anon, authenticated using (false) with check (false);

create or replace function public.archive_current_month() returns text
language sql stable as $$ select to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM') $$;

-- Oldest month that must stay live (current + previous two).
create or replace function public.archive_retention_floor() returns text
language sql stable as $$
  select to_char(date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '2 months', 'YYYY-MM')
$$;

create or replace function public.archive_is_eligible(p_month text) returns boolean
language sql stable as $$ select p_month ~ '^\d{4}-\d{2}$' and p_month < public.archive_retention_floor() $$;

-- The archive scope of a month. Rows referenced by newer retained rows are excluded (carried over).
create or replace function public.archive_scope(p_month text)
returns table (table_name text, id text)
language sql stable as $$
  with b as (select d_from, d_to from public.report_month_bounds(p_month)),
  inv as (
    select i.id from public.invoices i, b
    where i.business_date between b.d_from and b.d_to
      and not exists (select 1 from public.payments p, b b2 where p.invoice_id = i.id and p.business_date > b2.d_to)
  ),
  bk as (
    select k.id from public.bookings k, b
    where k.check_out between b.d_from and b.d_to and k.status in ('CHECKED_OUT', 'CANCELLED', 'NO_SHOW')
      and not exists (select 1 from public.invoices i where i.booking_id = k.id and i.id not in (select id from inv))
      and not exists (select 1 from public.payments p, b b2 where p.booking_id = k.id and p.business_date > b2.d_to)
  ),
  ord as (
    select o.id from public.orders o, b
    where (o.created_at at time zone 'Asia/Kolkata')::date between b.d_from and b.d_to
      and o.status in ('PAID', 'CANCELLED', 'COMPLETED')
      and not exists (select 1 from public.invoices i where i.order_id = o.id and i.id not in (select id from inv))
  )
  select 'invoices', id from inv
  union all select 'invoice_items', x.id from public.invoice_items x where x.invoice_id in (select id from inv)
  union all select 'payments', p.id from public.payments p, b where p.business_date between b.d_from and b.d_to
              and (p.invoice_id is null or p.invoice_id in (select id from inv))
              and (p.booking_id is null or p.booking_id in (select id from bk))
  union all select 'expenses', e.id from public.expenses e, b where e.business_date between b.d_from and b.d_to
  union all select 'ledger_entries', l.id from public.ledger_entries l, b where l.business_date between b.d_from and b.d_to
  union all select 'daily_closings', c.id from public.daily_closings c, b where c.business_date between b.d_from and b.d_to
  union all select 'shifts', s.id from public.shifts s, b where (s.opened_at at time zone 'Asia/Kolkata')::date between b.d_from and b.d_to
  union all select 'bookings', id from bk
  union all select 'orders', id from ord
  union all select 'order_items', x.id from public.order_items x where x.order_id in (select id from ord)
$$;

create or replace function public.archive_tables() returns text[]
language sql immutable as $$
  -- children before parents (purge order); export uses the same list
  select array['invoice_items', 'payments', 'ledger_entries', 'expenses', 'daily_closings', 'shifts',
               'invoices', 'order_items', 'orders', 'bookings']
$$;

-- Content digest: per table row count, money total and SHA-256 of the sorted id list.
-- The browser computes the same digest from the downloaded data.json.
create or replace function public.archive_digest(p_month text)
returns jsonb
language plpgsql stable as $$
declare
  t text;
  v jsonb := '{}'::jsonb;
  v_count bigint;
  v_total bigint;
  v_hash text;
  v_money text;
begin
  foreach t in array public.archive_tables() loop
    v_money := case t when 'invoices' then 'total_paise' when 'bookings' then 'total_paise'
                      when 'payments' then 'amount_paise' when 'expenses' then 'amount_paise'
                      when 'ledger_entries' then 'amount_paise' when 'invoice_items' then 'amount_paise' else null end;
    execute format(
      'select count(*), %s, encode(sha256(convert_to(coalesce(string_agg(t.id, '','' order by t.id collate "C"), ''''), ''UTF8'')), ''hex'')
       from public.%I t where t.id in (select id from public.archive_scope($1) where table_name = %L)',
      case when v_money is null then '0' else format('coalesce(sum(t.%I), 0)', v_money) end, t, t)
      into v_count, v_total, v_hash using p_month;
    v := v || jsonb_build_object(t, jsonb_build_object('count', v_count, 'total_paise', v_total, 'ids_sha256', v_hash));
  end loop;
  return v;
end $$;

-- One page of rows (client JSON shape) for the export, keyset-paginated by id.
create or replace function public.archive_month_rows(p_month text, p_table text, p_after text default '', p_limit integer default 500)
returns jsonb
language plpgsql stable as $$
declare v jsonb;
begin
  if not (p_table = any (public.archive_tables())) then
    raise exception 'unknown archive table %', p_table;
  end if;
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t) - ''change_seq'' - ''synced_at'' order by t.id collate "C"), ''[]'')
     from (select * from public.%I t where t.id in (select id from public.archive_scope($1) where table_name = %L)
           and t.id collate "C" > $2 collate "C" order by t.id collate "C" limit $3) t', p_table, p_table)
    into v using p_month, coalesce(p_after, ''), least(greatest(coalesce(p_limit, 500), 1), 2000);
  return v;
end $$;

-- Catalog rows the archived detail points at (not purged). Included in the bundle so the SQL
-- dump restores into an empty database without foreign-key failures.
create or replace function public.archive_reference_rows(p_month text)
returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'rooms', (select coalesce(jsonb_agg(to_jsonb(r) - 'change_seq' - 'synced_at' order by r.id), '[]')
              from public.rooms r
              where r.id in (select b.room_id from public.bookings b
                             where b.id in (select id from public.archive_scope(p_month) where table_name = 'bookings')))
  )
$$;

create or replace function public.archive_status()
returns jsonb
language sql stable as $$
  with months as (
    select distinct to_char(business_date, 'YYYY-MM') m from public.invoices
    union select distinct to_char(business_date, 'YYYY-MM') from public.payments
    union select distinct to_char(business_date, 'YYYY-MM') from public.expenses
    union select distinct to_char(business_date, 'YYYY-MM') from public.ledger_entries
  )
  select jsonb_build_object(
    'current_month', public.archive_current_month(),
    'retention_floor', public.archive_retention_floor(),
    'pending', (select coalesce(jsonb_agg(m order by m), '[]') from months
                where public.archive_is_eligible(m) and not exists (select 1 from public.archive_months a where a.month = m)),
    'archived', (select coalesce(jsonb_agg(jsonb_build_object('month', month, 'archived_at', archived_at) order by month), '[]')
                 from public.archive_months),
    'carried_over', (select coalesce(jsonb_agg(m order by m), '[]') from months
                     where exists (select 1 from public.archive_months a where a.month = m)),
    'verified', (select coalesce(jsonb_agg(jsonb_build_object('month', month, 'verified_at', verified_at) order by month), '[]')
                 from public.archive_verifications)
  )
$$;

create or replace function public.archive_verify(p_month text, p_digest jsonb, p_manifest jsonb)
returns jsonb
language plpgsql as $$
declare v_server jsonb;
begin
  if not public.archive_is_eligible(p_month) then
    raise exception 'month % is inside the live retention window', p_month;
  end if;
  v_server := public.archive_digest(p_month);
  if v_server <> p_digest then
    return jsonb_build_object('ok', false, 'server', v_server, 'uploaded', p_digest);
  end if;
  insert into public.archive_verifications (month, digest, manifest) values (p_month, p_digest, coalesce(p_manifest, '{}'))
  on conflict (month) do update set verified_at = now(), digest = excluded.digest, manifest = excluded.manifest;
  return jsonb_build_object('ok', true, 'digest', v_server);
end $$;

create or replace function public.archive_begin(p_month text)
returns jsonb
language plpgsql as $$
declare
  v_ver public.archive_verifications%rowtype;
  v_now jsonb;
  v_summary jsonb;
begin
  perform public.sync_lock();
  if not public.archive_is_eligible(p_month) then
    raise exception 'month % is inside the live retention window', p_month;
  end if;
  if public.report_is_archived(p_month) then
    return jsonb_build_object('ok', true, 'already_archived', true);
  end if;
  select * into v_ver from public.archive_verifications where month = p_month;
  if not found then
    raise exception 'month % has no verified archive upload', p_month;
  end if;
  v_now := public.archive_digest(p_month);
  if v_now <> v_ver.digest then
    raise exception 'month % changed since the archive was verified; download and verify again', p_month;
  end if;
  v_summary := public.refresh_monthly_summaries(p_month);
  insert into public.archive_months (month, manifest)
  values (p_month, jsonb_build_object('digest', v_now, 'manifest', v_ver.manifest, 'summary', v_summary));
  return jsonb_build_object('ok', true, 'summary', v_summary);
end $$;

-- Delete up to p_limit archived rows (children first). Call until remaining = 0.
create or replace function public.archive_purge_step(p_month text, p_limit integer default 500)
returns jsonb
language plpgsql as $$
declare
  t text;
  v_deleted integer := 0;
  v_n integer;
  v_remaining bigint := 0;
begin
  if not public.report_is_archived(p_month) then
    raise exception 'month % is not archived yet (run archive_begin first)', p_month;
  end if;
  perform public.sync_lock();
  foreach t in array public.archive_tables() loop
    exit when v_deleted >= p_limit;
    execute format(
      'delete from public.%I where id in (select id from public.archive_scope($1) where table_name = %L limit $2)', t, t)
      using p_month, p_limit - v_deleted;
    get diagnostics v_n = row_count;
    v_deleted := v_deleted + v_n;
  end loop;
  select count(*) into v_remaining from public.archive_scope(p_month);
  return jsonb_build_object('deleted', v_deleted, 'remaining', v_remaining,
    'note', case when v_remaining = 0 then 'Run VACUUM ANALYZE in the SQL editor to return space' end);
end $$;

-- Database size monitoring (Settings): warn at 300 MB, alert at 400 MB (Free tier read-only at 500 MB).
create or replace function public.db_size_report()
returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'database_bytes', pg_database_size(current_database()),
    'warn_bytes', 300 * 1024 * 1024,
    'alert_bytes', 400 * 1024 * 1024,
    'limit_bytes', 500 * 1024 * 1024,
    'level', case when pg_database_size(current_database()) >= 400 * 1024 * 1024 then 'alert'
                  when pg_database_size(current_database()) >= 300 * 1024 * 1024 then 'warn' else 'ok' end,
    'tables', (select coalesce(jsonb_agg(jsonb_build_object('table', relname, 'bytes', bytes) order by bytes desc), '[]')
               from (select c.relname, pg_total_relation_size(c.oid) bytes from pg_class c
                     join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relkind = 'r'
                     order by 2 desc limit 12) t)
  )
$$;

do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'archive\_%' or p.proname = 'db_size_report')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
