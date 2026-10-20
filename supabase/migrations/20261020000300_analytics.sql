-- Phase 5: server-side analytics. Small result sets only; nothing large leaves Postgres.
--
-- Canonical model (same as the app's local calculations):
--   billed revenue  = ISSUED, non-deleted invoices by business_date
--                   + CHECKED_OUT, non-deleted bookings without an ISSUED invoice, by check_out
--   collections     = non-deleted payments by business_date
--   costs           = non-deleted expenses by business_date
--   accounting      = non-deleted ledger entries by business_date
-- All money is integer paise; all dates are Asia/Kolkata business dates.
--
-- Months whose detail rows were archived (see archive_months) are answered from the permanent
-- monthly summaries instead, so totals and trends survive the 3-month retention window.

create table if not exists public.archive_months (
  month text primary key check (month ~ '^\d{4}-\d{2}$'),
  archived_at timestamptz not null default now(),
  manifest jsonb not null
);

create table if not exists public.monthly_business_summary (
  business_id text not null,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  invoices integer not null default 0,
  billed_paise bigint not null default 0,
  discount_paise bigint not null default 0,
  tax_paise bigint not null default 0,
  stay_revenue_paise bigint not null default 0,
  stay_checkouts integer not null default 0,
  collected_paise bigint not null default 0,
  payments_by_method jsonb not null default '{}'::jsonb,
  expenses_paise bigint not null default 0,
  ledger_net_paise bigint not null default 0,
  cancelled_invoices integer not null default 0,
  sold_nights integer not null default 0,
  booking_cancellations integer not null default 0,
  booking_no_shows integer not null default 0,
  refreshed_at timestamptz not null default now(),
  primary key (business_id, month)
);

create table if not exists public.monthly_item_summary (
  business_id text not null,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  item_name text not null,
  qty numeric(14, 3) not null default 0,
  amount_paise bigint not null default 0,
  bills integer not null default 0,
  refreshed_at timestamptz not null default now(),
  primary key (business_id, month, item_name)
);

alter table public.archive_months enable row level security;
alter table public.monthly_business_summary enable row level security;
alter table public.monthly_item_summary enable row level security;
do $$
declare t text;
begin
  foreach t in array array['archive_months', 'monthly_business_summary', 'monthly_item_summary'] loop
    execute format('drop policy if exists %I on public.%I', t || '_no_anon', t);
    execute format('create policy %I on public.%I for all to anon, authenticated using (false) with check (false)', t || '_no_anon', t);
  end loop;
end $$;

create or replace function public.report_month_bounds(p_month text, out d_from date, out d_to date)
language sql immutable as $$
  select to_date(p_month || '-01', 'YYYY-MM-DD'), (to_date(p_month || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date
$$;

create or replace function public.report_is_archived(p_month text) returns boolean
language sql stable as $$ select exists (select 1 from public.archive_months where month = p_month) $$;

-- Revenue rows at business-date grain from live detail (invoices + un-invoiced stays).
create or replace function public.report_revenue_rows(p_from date, p_to date, p_business text default null)
returns table (business_id text, business_date date, amount_paise bigint, source text)
language sql stable as $$
  select i.business_id, i.business_date, i.total_paise, 'invoice'
  from public.invoices i
  where i.deleted_at is null and i.status = 'ISSUED'
    and i.business_date between p_from and p_to
    and (p_business is null or i.business_id = p_business)
  union all
  select b.business_id, b.check_out, b.total_paise, 'stay'
  from public.bookings b
  where b.deleted_at is null and b.status = 'CHECKED_OUT'
    and b.check_out between p_from and p_to
    and (p_business is null or b.business_id = p_business)
    and not exists (select 1 from public.invoices i where i.booking_id = b.id and i.deleted_at is null and i.status = 'ISSUED')
$$;

-- ---------------------------------------------------------------------------
-- Monthly summaries (written before any purge; kept forever)
-- ---------------------------------------------------------------------------
create or replace function public.refresh_monthly_summaries(p_month text)
returns jsonb
language plpgsql as $$
declare
  b record;
  r_from date;
  r_to date;
  v_rows integer := 0;
begin
  if public.report_is_archived(p_month) then
    raise exception 'month % is archived; its summaries are frozen', p_month;
  end if;
  select d_from, d_to into r_from, r_to from public.report_month_bounds(p_month);

  for b in select id from public.businesses loop
    insert into public.monthly_business_summary as s (
      business_id, month, invoices, billed_paise, discount_paise, tax_paise, stay_revenue_paise, stay_checkouts,
      collected_paise, payments_by_method, expenses_paise, ledger_net_paise, cancelled_invoices, sold_nights,
      booking_cancellations, booking_no_shows, refreshed_at)
    select b.id, p_month,
      (select count(*) from public.invoices i where i.business_id = b.id and i.deleted_at is null and i.status = 'ISSUED' and i.business_date between r_from and r_to),
      (select coalesce(sum(total_paise), 0) from public.invoices i where i.business_id = b.id and i.deleted_at is null and i.status = 'ISSUED' and i.business_date between r_from and r_to),
      (select coalesce(sum(discount_paise), 0) from public.invoices i where i.business_id = b.id and i.deleted_at is null and i.status = 'ISSUED' and i.business_date between r_from and r_to),
      (select coalesce(sum(tax_paise), 0) from public.invoices i where i.business_id = b.id and i.deleted_at is null and i.status = 'ISSUED' and i.business_date between r_from and r_to),
      (select coalesce(sum(amount_paise), 0) from public.report_revenue_rows(r_from, r_to, b.id) where source = 'stay'),
      (select count(*) from public.report_revenue_rows(r_from, r_to, b.id) where source = 'stay'),
      (select coalesce(sum(amount_paise), 0) from public.payments p where p.business_id = b.id and p.deleted_at is null and p.business_date between r_from and r_to),
      (select coalesce(jsonb_object_agg(method, total), '{}'::jsonb) from (
         select method, sum(amount_paise) total from public.payments p
         where p.business_id = b.id and p.deleted_at is null and p.business_date between r_from and r_to group by method) m),
      (select coalesce(sum(amount_paise), 0) from public.expenses e where e.business_id = b.id and e.deleted_at is null and e.business_date between r_from and r_to),
      (select coalesce(sum(amount_paise), 0) from public.ledger_entries l where l.business_id = b.id and l.deleted_at is null and l.business_date between r_from and r_to),
      (select count(*) from public.invoices i where i.business_id = b.id and i.deleted_at is null and i.status in ('CANCELLED', 'VOIDED') and i.business_date between r_from and r_to),
      (select coalesce(sum(greatest(0, least(bk.check_out, r_to + 1) - greatest(bk.check_in, r_from))), 0)
         from public.bookings bk where bk.business_id = b.id and bk.deleted_at is null
           and bk.status not in ('CANCELLED', 'NO_SHOW') and bk.check_in <= r_to and bk.check_out > r_from),
      (select count(*) from public.bookings bk where bk.business_id = b.id and bk.deleted_at is null and bk.status = 'CANCELLED' and bk.check_in between r_from and r_to),
      (select count(*) from public.bookings bk where bk.business_id = b.id and bk.deleted_at is null and bk.status = 'NO_SHOW' and bk.check_in between r_from and r_to),
      now()
    on conflict (business_id, month) do update set
      invoices = excluded.invoices, billed_paise = excluded.billed_paise, discount_paise = excluded.discount_paise,
      tax_paise = excluded.tax_paise, stay_revenue_paise = excluded.stay_revenue_paise, stay_checkouts = excluded.stay_checkouts,
      collected_paise = excluded.collected_paise, payments_by_method = excluded.payments_by_method,
      expenses_paise = excluded.expenses_paise, ledger_net_paise = excluded.ledger_net_paise,
      cancelled_invoices = excluded.cancelled_invoices, sold_nights = excluded.sold_nights,
      booking_cancellations = excluded.booking_cancellations, booking_no_shows = excluded.booking_no_shows,
      refreshed_at = now();
    v_rows := v_rows + 1;
  end loop;

  delete from public.monthly_item_summary where month = p_month;
  insert into public.monthly_item_summary (business_id, month, item_name, qty, amount_paise, bills)
  select i.business_id, p_month, x.name, sum(x.qty), sum(x.amount_paise), count(distinct i.id)
  from public.invoice_items x
  join public.invoices i on i.id = x.invoice_id
  where x.deleted_at is null and i.deleted_at is null and i.status = 'ISSUED' and i.business_date between r_from and r_to
  group by i.business_id, x.name;

  return jsonb_build_object('month', p_month, 'businesses', v_rows,
    'items', (select count(*) from public.monthly_item_summary where month = p_month));
end $$;

-- ---------------------------------------------------------------------------
-- Dashboard: today / month / year / all-time per business, archived months via summaries
-- ---------------------------------------------------------------------------
create or replace function public.report_dashboard(p_today date)
returns jsonb
language sql stable as $$
  with live as (
    select r.business_id, r.business_date, r.amount_paise, r.source
    from public.report_revenue_rows('1900-01-01', '2999-12-31', null) r
    where not public.report_is_archived(to_char(r.business_date, 'YYYY-MM'))
  ),
  inv as (
    select business_id, count(*) n from public.invoices
    where deleted_at is null and status = 'ISSUED' and not public.report_is_archived(to_char(business_date, 'YYYY-MM'))
    group by business_id
  ),
  arch as (
    select business_id, month, billed_paise, billed_paise + stay_revenue_paise revenue, expenses_paise, invoices
    from public.monthly_business_summary s where public.report_is_archived(s.month)
  ),
  exp as (
    select business_id, sum(amount_paise) total from public.expenses
    where deleted_at is null and not public.report_is_archived(to_char(business_date, 'YYYY-MM'))
    group by business_id
  ),
  per as (
    select b.id business_id, b.type,
      coalesce((select sum(amount_paise) from live l where l.business_id = b.id and l.source = 'invoice' and l.business_date = p_today), 0) as today,
      coalesce((select sum(amount_paise) from live l where l.business_id = b.id and l.source = 'invoice'
                and to_char(l.business_date, 'YYYY-MM') = to_char(p_today, 'YYYY-MM')), 0) as month,
      coalesce((select sum(amount_paise) from live l where l.business_id = b.id and l.source = 'invoice'
                and extract(year from l.business_date) = extract(year from p_today)), 0)
        + coalesce((select sum(billed_paise) from public.monthly_business_summary s where s.business_id = b.id
                    and public.report_is_archived(s.month) and left(s.month, 4) = to_char(p_today, 'YYYY')), 0) as year,
      coalesce((select sum(amount_paise) from live l where l.business_id = b.id and l.source = 'invoice'), 0)
        + coalesce((select sum(billed_paise) from arch a where a.business_id = b.id), 0) revenue,
      coalesce((select total from exp e where e.business_id = b.id), 0)
        + coalesce((select sum(expenses_paise) from arch a where a.business_id = b.id), 0) expenses,
      coalesce((select n from inv where inv.business_id = b.id), 0)
        + coalesce((select sum(invoices) from arch a where a.business_id = b.id), 0) transactions
    from public.businesses b
  )
  select jsonb_build_object(
    'today_date', p_today,
    'today', coalesce(sum(today), 0),
    'month', coalesce(sum(month), 0),
    'restaurant', coalesce(sum(month) filter (where type = 'RESTAURANT'), 0),
    'stay', coalesce(sum(month) filter (where type = 'STAY'), 0),
    'by_business', coalesce(jsonb_agg(jsonb_build_object(
      'business_id', business_id, 'today', today, 'month', month, 'year', year, 'revenue', revenue,
      'expenses', expenses, 'profit', revenue - expenses, 'transactions', transactions,
      'avg', case when transactions > 0 then round(revenue::numeric / transactions) else 0 end) order by business_id), '[]'))
  from per
$$;

-- ---------------------------------------------------------------------------
-- Period analytics (matches AppService.analytics): revenue, expenses, profit, by day/month/year
-- ---------------------------------------------------------------------------
create or replace function public.report_analytics(p_from date, p_to date, p_business text default null)
returns jsonb
language sql stable as $$
  with live as (
    select * from public.report_revenue_rows(p_from, p_to, p_business)
    where not public.report_is_archived(to_char(business_date, 'YYYY-MM'))
  ),
  arch as (
    select s.month, sum(s.billed_paise + s.stay_revenue_paise) revenue, sum(s.expenses_paise) expenses,
           sum(s.invoices + s.stay_checkouts) n
    from public.monthly_business_summary s
    where public.report_is_archived(s.month)
      and s.month between to_char(p_from, 'YYYY-MM') and to_char(p_to, 'YYYY-MM')
      and (p_business is null or s.business_id = p_business)
    group by s.month
  ),
  exp as (
    select coalesce(sum(amount_paise), 0) total from public.expenses
    where deleted_at is null and business_date between p_from and p_to
      and (p_business is null or business_id = p_business)
      and not public.report_is_archived(to_char(business_date, 'YYYY-MM'))
  ),
  totals as (
    select coalesce((select sum(amount_paise) from live), 0) + coalesce((select sum(revenue) from arch), 0) revenue,
           (select total from exp) + coalesce((select sum(expenses) from arch), 0) expenses,
           (select count(*) from live) + coalesce((select sum(n) from arch), 0) transactions
  )
  select jsonb_build_object(
    'revenue', t.revenue, 'expenses', t.expenses, 'profit', t.revenue - t.expenses, 'transactions', t.transactions,
    'by_date', (select coalesce(jsonb_object_agg(d, v), '{}') from (select business_date::text d, sum(amount_paise) v from live group by 1) x),
    'by_month', (select coalesce(jsonb_object_agg(m, v), '{}') from (
        select m, sum(v) v from (
          select to_char(business_date, 'YYYY-MM') m, amount_paise v from live
          union all select month, revenue from arch) u group by m) x),
    'by_year', (select coalesce(jsonb_object_agg(y, v), '{}') from (
        select y, sum(v) v from (
          select to_char(business_date, 'YYYY') y, amount_paise v from live
          union all select left(month, 4), revenue from arch) u group by y) x),
    'archived_months', (select coalesce(jsonb_agg(month order by month), '[]') from arch)
  ) from totals t
$$;

-- ---------------------------------------------------------------------------
-- Item analytics: sales by item, best and least sellers (zero-sale active products included)
-- ---------------------------------------------------------------------------
create or replace function public.report_item_sales(p_business text, p_from date, p_to date, p_limit integer default 10)
returns jsonb
language sql stable as $$
  with live as (
    select x.name, sum(x.qty) qty, sum(x.amount_paise) amount, count(distinct i.id) bills
    from public.invoice_items x join public.invoices i on i.id = x.invoice_id
    where x.deleted_at is null and i.deleted_at is null and i.status = 'ISSUED'
      and i.business_id = p_business and i.business_date between p_from and p_to
      and not public.report_is_archived(to_char(i.business_date, 'YYYY-MM'))
    group by x.name
  ),
  arch as (
    select item_name name, sum(qty) qty, sum(amount_paise) amount, sum(bills) bills
    from public.monthly_item_summary
    where business_id = p_business and public.report_is_archived(month)
      and month between to_char(p_from, 'YYYY-MM') and to_char(p_to, 'YYYY-MM')
    group by item_name
  ),
  sold as (
    select name, sum(qty) qty, sum(amount) amount, sum(bills) bills from (select * from live union all select * from arch) u group by name
  ),
  catalog as (
    select p.name, coalesce(s.qty, 0) qty, coalesce(s.amount, 0) amount, coalesce(s.bills, 0) bills
    from public.products p left join sold s on s.name = p.name
    where p.business_id = p_business and p.deleted_at is null and p.active
  )
  select jsonb_build_object(
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'amount_paise', amount, 'bills', bills)
                order by amount desc, name), '[]') from sold),
    'best_sellers', (select coalesce(jsonb_agg(x), '[]') from (select name, qty, amount amount_paise from sold
                order by qty desc, amount desc, name limit p_limit) x),
    'least_sellers', (select coalesce(jsonb_agg(x), '[]') from (select name, qty, amount amount_paise from catalog
                order by qty asc, amount asc, name limit p_limit) x)
  )
$$;

create or replace function public.report_item_trends(p_business text, p_from_month text, p_to_month text, p_limit integer default 10)
returns jsonb
language sql stable as $$
  with live as (
    select to_char(i.business_date, 'YYYY-MM') as month, x.name, sum(x.qty) qty, sum(x.amount_paise) amount
    from public.invoice_items x join public.invoices i on i.id = x.invoice_id
    where x.deleted_at is null and i.deleted_at is null and i.status = 'ISSUED' and i.business_id = p_business
      and to_char(i.business_date, 'YYYY-MM') between p_from_month and p_to_month
      and not public.report_is_archived(to_char(i.business_date, 'YYYY-MM'))
    group by 1, 2
  ),
  allm as (
    select * from live
    union all
    select month, item_name, qty, amount_paise from public.monthly_item_summary
    where business_id = p_business and month between p_from_month and p_to_month and public.report_is_archived(month)
  ),
  ranked as (
    select month, name, qty, amount, rank() over (partition by month order by qty desc, amount desc) rk from allm
  )
  select coalesce(jsonb_agg(jsonb_build_object('month', month, 'name', name, 'qty', qty, 'amount_paise', amount, 'rank', rk)
           order by month, rk, name), '[]')
  from ranked where rk <= p_limit
$$;

-- ---------------------------------------------------------------------------
-- Time-of-day and weekday sales (Asia/Kolkata), payment mix, reconciliation
-- ---------------------------------------------------------------------------
create or replace function public.report_sales_by_time(p_business text, p_from date, p_to date,
  p_morning_start integer default 5, p_afternoon_start integer default 12, p_evening_start integer default 17, p_night_start integer default 22)
returns jsonb
language sql stable as $$
  with s as (
    select extract(hour from (i.created_at at time zone 'Asia/Kolkata'))::int h,
           extract(dow from i.business_date)::int dow, i.total_paise amount
    from public.invoices i
    where i.deleted_at is null and i.status = 'ISSUED' and i.business_id = p_business
      and i.business_date between p_from and p_to
  ),
  b as (
    select case when h >= p_night_start or h < p_morning_start then 'night'
                when h >= p_evening_start then 'evening'
                when h >= p_afternoon_start then 'afternoon'
                else 'morning' end bucket, amount from s
  ),
  wd as (
    select dow, amount, bills, rank() over (order by amount desc) rk
    from (select dow, sum(amount) amount, count(*) bills from s group by dow) g
  )
  select jsonb_build_object(
    'by_hour', (select coalesce(jsonb_object_agg(h, v), '{}') from (select h, sum(amount) v from s group by h) x),
    'by_bucket', (select coalesce(jsonb_object_agg(bucket, v), '{}') from (select bucket, sum(amount) v from b group by bucket) x),
    'by_weekday', (select coalesce(jsonb_agg(jsonb_build_object(
        'weekday', (array['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])[dow + 1],
        'dow', dow, 'amount_paise', amount, 'bills', bills, 'rank', rk) order by amount desc), '[]') from wd)
  )
$$;

create or replace function public.report_payment_mix(p_business text, p_from date, p_to date)
returns jsonb
language sql stable as $$
  select coalesce(jsonb_object_agg(method, jsonb_build_object('amount_paise', total, 'count', n)), '{}')
  from (
    select method, sum(amount_paise) total, count(*) n from public.payments
    where deleted_at is null and business_id = p_business and business_date between p_from and p_to
    group by method
  ) x
$$;

create or replace function public.report_reconciliation(p_business text, p_from date, p_to date)
returns jsonb
language sql stable as $$
  with days as (select generate_series(p_from, p_to, interval '1 day')::date d)
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', d,
    'billed_paise', (select coalesce(sum(total_paise), 0) from public.invoices i where i.business_id = p_business and i.deleted_at is null and i.status = 'ISSUED' and i.business_date = d),
    'collected_paise', (select coalesce(sum(amount_paise), 0) from public.payments p where p.business_id = p_business and p.deleted_at is null and p.business_date = d),
    'cash_paise', (select coalesce(sum(amount_paise), 0) from public.payments p where p.business_id = p_business and p.deleted_at is null and p.business_date = d and p.method = 'CASH'),
    'expenses_paise', (select coalesce(sum(amount_paise), 0) from public.expenses e where e.business_id = p_business and e.deleted_at is null and e.business_date = d),
    'ledger_net_paise', (select coalesce(sum(amount_paise), 0) from public.ledger_entries l where l.business_id = p_business and l.deleted_at is null and l.business_date = d),
    'closing', (select jsonb_build_object('expected_cash_paise', c.expected_cash_paise, 'actual_cash_paise', c.actual_cash_paise,
                  'difference_paise', c.difference_paise, 'status', c.status)
                from public.daily_closings c where c.business_id = p_business and c.business_date = d and c.deleted_at is null
                  and c.superseded_by is null order by (c.status = 'CLOSED') desc, c.updated_at desc limit 1),
    'unpaid_invoices', (select count(*) from public.invoices i where i.business_id = p_business and i.deleted_at is null and i.status = 'ISSUED' and i.business_date = d and i.balance_amount_paise > 0)
  ) order by d), '[]') from days
$$;

-- ---------------------------------------------------------------------------
-- Stays: occupancy, ADR, RevPAR, cancellations, no-shows (matches AppService.stayAnalytics)
-- ---------------------------------------------------------------------------
create or replace function public.report_stay(p_business text, p_from date, p_to date)
returns jsonb
language sql stable as $$
  with rooms as (select id from public.rooms where business_id = p_business),
  days as (select (p_to - p_from + 1) n),
  bk as (select * from public.bookings where business_id = p_business and status <> 'CANCELLED'),
  sold as (
    select coalesce(sum(greatest(0, least(check_out, p_to + 1) - greatest(check_in, p_from))), 0)::int nights
    from bk where status <> 'NO_SHOW' and check_in <= p_to and check_out > p_from
  ),
  rev as (select coalesce(sum(rate_paise * (check_out - check_in)), 0) room_revenue from bk),
  avail as (select (select count(*) from rooms) * (select n from days) nights),
  monthly as (
    select to_char(check_in, 'YYYY-MM') as month,
           count(*) filter (where status = 'CANCELLED') cancellations,
           count(*) filter (where status = 'NO_SHOW') no_shows,
           count(*) bookings
    from public.bookings where business_id = p_business and check_in between p_from and p_to group by 1
  )
  select jsonb_build_object(
    'sold_nights', (select nights from sold),
    'available_nights', (select nights from avail),
    'occupancy', case when (select nights from avail) > 0 then round((select nights from sold)::numeric / (select nights from avail), 4) else 0 end,
    'room_revenue', (select room_revenue from rev),
    'adr', case when (select nights from sold) > 0 then round((select room_revenue from rev)::numeric / (select nights from sold)) else 0 end,
    'revpar', case when (select nights from avail) > 0 then round((select room_revenue from rev)::numeric / (select nights from avail)) else 0 end,
    'bookings', (select count(*) from bk),
    'cancellations', (select count(*) from public.bookings where business_id = p_business and status = 'CANCELLED'),
    'no_shows', (select count(*) from public.bookings where business_id = p_business and status = 'NO_SHOW'),
    'by_month', (select coalesce(jsonb_agg(to_jsonb(m) order by m.month), '[]') from monthly m),
    'note', 'booking source is not captured by the app yet'
  )
$$;

do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'report\_%' or p.proname = 'refresh_monthly_summaries')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
