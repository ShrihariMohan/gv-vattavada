-- Integration test for analytics RPCs, monthly summaries, archive verify/begin/purge.
-- Runs after 10_sync_test.sql on the same throwaway database.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
update public.feature_flags set enabled = true where key = 'dual_write';

\ir fixtures/archive_month_fixture.sql

-- Analytics ---------------------------------------------------------------
do $$
declare r jsonb;
begin
  r := public.report_analytics('2026-07-01', '2026-07-31', null);
  assert (r ->> 'revenue')::bigint = 6000 + 9000 + 500000, 'revenue = invoices + un-invoiced stay: ' || r::text;
  assert (r ->> 'expenses')::bigint = 1000, r::text;
  assert (r -> 'by_date' ->> '2026-07-12')::bigint = 500000, 'stay revenue on check_out date';

  r := public.report_item_sales('biz-rest', '2026-07-01', '2026-07-31');
  assert r -> 'best_sellers' -> 0 ->> 'name' = 'Tea', r::text;
  r := public.report_item_sales('biz-rest', '2026-07-01', '2026-07-30');
  assert r -> 'least_sellers' -> 0 ->> 'name' = 'Cake' and (r -> 'least_sellers' -> 0 ->> 'qty')::numeric = 0,
    'zero-sale active product listed: ' || r::text;

  r := public.report_sales_by_time('biz-rest', '2026-07-01', '2026-07-31');
  assert (r -> 'by_hour' ->> '13')::bigint = 6000, 'Kolkata hour (07:30Z = 13:00 IST): ' || r::text;
  assert (r -> 'by_bucket' ->> 'evening')::bigint = 9000, '14:00Z = 19:30 IST evening';
  assert r -> 'by_weekday' -> 0 ->> 'weekday' = 'Friday', 'ranked weekdays: ' || r::text;

  r := public.report_payment_mix('biz-rest', '2026-07-01', '2026-08-31');
  assert (r -> 'CASH' ->> 'amount_paise')::bigint = 6000 and (r -> 'UPI' ->> 'amount_paise')::bigint = 9000 + 4000, r::text; -- pay_1 (Aug 1) from 10_sync_test

  r := public.report_stay('biz-stay-a', '2026-07-01', '2026-07-31');
  assert (r ->> 'sold_nights')::int = 2 and (r ->> 'adr')::bigint = 250000, r::text;

  r := public.report_reconciliation('biz-rest', '2026-07-05', '2026-07-06');
  assert (r -> 0 ->> 'billed_paise')::bigint = 6000 and (r -> 0 ->> 'cash_paise')::bigint = 6000, r::text;

  r := public.report_dashboard('2026-10-20');
  assert (r ->> 'month')::bigint = 0, 'nothing billed in Oct';
  assert (select (x ->> 'revenue')::bigint from jsonb_array_elements(r -> 'by_business') x where x ->> 'business_id' = 'biz-rest') > 0, r::text;
end $$;

-- Archive: eligibility, verification, begin, purge, reports unchanged ------
create temp table before_archive as
  select public.report_analytics('2026-07-01', '2026-07-31', null) a,
         public.report_dashboard('2026-10-20') d,
         public.report_item_sales('biz-rest', '2026-07-01', '2026-07-31') items;

do $$
declare r jsonb; d jsonb; bad jsonb; loops int := 0; seq_before bigint;
begin
  assert public.archive_is_eligible('2026-07'), 'July is outside current + previous two months';
  assert not public.archive_is_eligible('2026-08'), 'August is still live';
  assert public.archive_status() -> 'pending' ? '2026-07', public.archive_status()::text;

  begin
    perform public.archive_begin('2026-07');
    raise exception 'begin without verification must fail';
  exception when others then
    assert sqlerrm like '%no verified archive%', sqlerrm;
  end;

  d := public.archive_digest('2026-07');
  assert (d -> 'invoices' ->> 'count')::int = 1, 'carried-over invoice (paid in Aug) excluded: ' || d::text;
  assert (d -> 'payments' ->> 'count')::int = 1 and (d -> 'bookings' ->> 'count')::int = 1, d::text;

  bad := jsonb_set(d, '{payments,total_paise}', '1');
  r := public.archive_verify('2026-07', bad, '{}');
  assert not (r ->> 'ok')::boolean, 'tampered digest rejected';

  r := public.archive_verify('2026-07', d, '{"files":["x.xlsx"]}');
  assert (r ->> 'ok')::boolean, r::text;

  -- export pages are complete and keyset-ordered
  r := public.archive_month_rows('2026-07', 'invoice_items', '', 1);
  assert jsonb_array_length(r) = 1 and r -> 0 ->> 'id' = 'ii_jul', r::text;
  assert jsonb_array_length(public.archive_month_rows('2026-07', 'invoice_items', 'ii_jul', 10)) = 0;

  select last_value into seq_before from public.sync_change_seq;
  r := public.archive_begin('2026-07');
  assert (r ->> 'ok')::boolean, r::text;
  loop
    r := public.archive_purge_step('2026-07', 3);
    loops := loops + 1;
    exit when (r ->> 'remaining')::int = 0;
    if loops > 20 then raise exception 'purge did not finish'; end if;
  end loop;
  assert loops > 1, 'purge ran in bounded steps';
  assert not exists (select 1 from public.invoices where id = 'i_jul'), 'archived invoice purged';
  assert exists (select 1 from public.invoices where id = 'i_carry'), 'invoice still referenced by Aug payment is carried over';
  assert exists (select 1 from public.products where id = 'p_tea'), 'catalog never purged';
  assert (select count(*) from public.tombstones where reason = 'ARCHIVED' and change_seq > seq_before) = 8,
    'every purged row leaves a tombstone for devices';
  begin
    perform public.refresh_monthly_summaries('2026-07');
    raise exception 'summaries of archived months must be frozen';
  exception when others then
    assert sqlerrm like '%frozen%', sqlerrm;
  end;
end $$;

do $$
declare b record; a jsonb; d jsonb; items jsonb;
begin
  select * into b from before_archive;
  a := public.report_analytics('2026-07-01', '2026-07-31', null);
  assert (a ->> 'revenue') = (b.a ->> 'revenue'), 'revenue unchanged after purge: ' || a::text || ' vs ' || b.a::text;
  assert (a ->> 'expenses') = (b.a ->> 'expenses'), 'expenses unchanged after purge';
  assert (a -> 'by_month' ->> '2026-07') = (b.a -> 'by_month' ->> '2026-07'), 'monthly trend unchanged';
  assert a -> 'archived_months' ? '2026-07';
  d := public.report_dashboard('2026-10-20');
  assert d = b.d, 'dashboard unchanged: ' || d::text || ' vs ' || b.d::text;
  items := public.report_item_sales('biz-rest', '2026-07-01', '2026-07-31');
  assert items -> 'best_sellers' = b.items -> 'best_sellers', 'item rankings from summaries: ' || items::text;
  assert (public.db_size_report() ->> 'level') = 'ok';
  assert not has_function_privilege('anon', 'public.archive_purge_step(text,integer)', 'execute');
end $$;

select 'analytics + archive tests passed' as result;
