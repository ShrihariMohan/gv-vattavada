-- Integration test for backfill, dual-write, reconcile and cursor pull.
-- Runs on a throwaway database created by scripts/migration/local-db.sh. Every check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- 1. Simulated production legacy data (what sync_records looks like today)
-- ---------------------------------------------------------------------------
insert into public.sync_records (entity_type, entity_id, operation, payload, device_id, updated_at) values
 ('customer', 'cust_1', 'CREATE', '{"id":"cust_1","name":"Asha","phone":"9","email":"","address":"","notes":"","server_id":null,"sync_status":"PENDING","created_at":"2026-08-01T05:00:00.000Z","updated_at":"2026-08-01T05:00:00.000Z","deleted_at":null,"device_id":"devA","version":1}', 'devA', '2026-08-01T05:00:01Z'),
 ('order', 'ord_1', 'UPDATE', '{"id":"ord_1","business_id":"biz-rest","table_id":null,"customer_id":"cust_1","guest_name":null,"status":"PAID","notes":"","created_at":"2026-08-01T05:00:00.000Z","updated_at":"2026-08-01T05:10:00.000Z","deleted_at":null,"device_id":"devA","version":1}', 'devA', now()),
 ('order_item', 'oi_1', 'UPDATE', '{"id":"oi_1","order_id":"ord_1","product_id":"p1","name":"Tea","qty":2,"unit_price_paise":2000,"tax_bps":0,"created_at":"2026-08-01T05:00:00.000Z","updated_at":"2026-08-01T05:00:00.000Z","deleted_at":null,"device_id":"devA","version":1}', 'devA', now()),
 ('invoice', 'inv_1', 'CREATE', '{"id":"inv_1","business_id":"biz-rest","customer_id":"cust_1","order_id":"ord_1","booking_id":null,"invoice_number":"R-1","invoice_type":"RESTAURANT","business_date":"2026-08-01","subtotal_paise":4000,"discount_paise":0,"tax_paise":0,"total_paise":4000,"paid_amount_paise":4000,"balance_amount_paise":0,"payment_status":"PAID","status":"ISSUED","notes":"","created_at":"2026-08-01T05:10:00.000Z","updated_at":"2026-08-01T05:10:00.000Z","deleted_at":null,"device_id":"devA","version":1,"future_field":"kept"}', 'devA', now()),
 ('invoice_item', 'ii_1', 'CREATE', '{"id":"ii_1","invoice_id":"inv_1","name":"Tea","qty":2,"unit_price_paise":2000,"amount_paise":4000,"created_at":"2026-08-01T05:10:00.000Z","updated_at":"2026-08-01T05:10:00.000Z","deleted_at":null,"device_id":"devA","version":1}', 'devA', now()),
 ('payment', 'pay_1', 'CREATE', '{"id":"pay_1","business_id":"biz-rest","invoice_id":"inv_1","booking_id":null,"customer_id":"cust_1","amount_paise":4000,"method":"UPI","business_date":"2026-08-01","notes":"","created_at":"2026-08-01T05:10:00.000Z","updated_at":"2026-08-01T05:10:00.000Z","deleted_at":null,"device_id":"devA","version":1}', 'devA', now()),
 -- invoice whose stored total is wrong (decision 2: imported as-is and flagged)
 ('invoice', 'inv_bad', 'CREATE', '{"id":"inv_bad","business_id":"biz-rest","order_id":null,"invoice_number":"R-2","invoice_type":"RESTAURANT","business_date":"2026-08-02","subtotal_paise":1000,"discount_paise":0,"tax_paise":0,"total_paise":900,"paid_amount_paise":0,"balance_amount_paise":900,"payment_status":"UNPAID","status":"ISSUED","notes":"","created_at":"2026-08-02T05:00:00.000Z","updated_at":"2026-08-02T05:00:00.000Z","deleted_at":null,"device_id":"devA","version":1}', 'devA', now()),
 -- orphan: parent invoice never reached the cloud
 ('invoice_item', 'ii_orphan', 'CREATE', '{"id":"ii_orphan","invoice_id":"inv_missing","name":"Coffee","qty":1,"unit_price_paise":3000,"amount_paise":3000,"created_at":"2026-08-03T05:00:00.000Z","updated_at":"2026-08-03T05:00:00.000Z","deleted_at":null,"device_id":"devB","version":1}', 'devB', now()),
 ('expense', 'exp_1', 'CREATE', '{"id":"exp_1","business_id":"biz-rest","category":"Gas","amount_paise":150000,"payment_method":"CASH","business_date":"2026-08-01","description":"","vendor":"","attachment":null,"created_at":"2026-08-01T05:00:00.000Z","updated_at":"2026-08-01T05:00:00.000Z","deleted_at":null,"device_id":"devA","version":1}', 'devA', now()),
 -- duplicate daily closings for the same day from two devices (decision 3)
 ('daily_closing', 'dc_a', 'CREATE', '{"id":"dc_a","business_id":"biz-rest","business_date":"2026-08-01","cash_sales_paise":0,"upi_sales_paise":4000,"card_sales_paise":0,"expected_cash_paise":0,"actual_cash_paise":0,"difference_paise":0,"closed_by":"u1","status":"CLOSED","reopened_at":null,"reopen_reason":"","created_at":"2026-08-01T17:00:00.000Z","updated_at":"2026-08-01T17:00:00.000Z","deleted_at":null,"device_id":"devA","version":1}', 'devA', now()),
 ('daily_closing', 'dc_b', 'CREATE', '{"id":"dc_b","business_id":"biz-rest","business_date":"2026-08-01","cash_sales_paise":0,"upi_sales_paise":4000,"card_sales_paise":0,"expected_cash_paise":0,"actual_cash_paise":0,"difference_paise":0,"closed_by":"u2","status":"CLOSED","reopened_at":null,"reopen_reason":"","created_at":"2026-08-01T18:00:00.000Z","updated_at":"2026-08-01T18:00:00.000Z","deleted_at":null,"device_id":"devB","version":1}', 'devB', now()),
 -- soft-deleted product via DELETE op without deleted_at in payload
 ('product', 'prod_del', 'DELETE', '{"id":"prod_del","business_id":"biz-rest","category_id":"cat","name":"Old","price_paise":100,"tax_bps":0,"tags":["x"],"active":true,"created_at":"2026-07-01T05:00:00.000Z","updated_at":"2026-07-01T05:00:00.000Z","deleted_at":null,"device_id":"devA","version":2}', 'devA', now()),
 -- users and unknown types are ignored by normalization
 ('user', 'u1', 'UPDATE', '{"id":"u1","username":"admin"}', 'devA', now());

-- ---------------------------------------------------------------------------
-- 2. Backfill in small resumable batches
-- ---------------------------------------------------------------------------
do $$
declare r jsonb; loops int := 0;
begin
  loop
    r := public.sync_backfill(3);
    loops := loops + 1;
    exit when (r ->> 'done')::boolean;
    if loops > 50 then raise exception 'backfill did not finish'; end if;
  end loop;
  assert loops >= 4, 'backfill should have needed several batches, got ' || loops;
  assert (select count(*) from public.invoices) = 2, 'invoices backfilled';
  assert (select count(*) from public.migration_quarantine where entity_id = 'ii_orphan') = 1, 'orphan quarantined';
  assert (select extra ->> 'future_field' from public.invoices where id = 'inv_1') = 'kept', 'unknown keys kept in extra';
  assert (select guest_name from public.orders where id = 'ord_1') = '', 'null in NOT NULL column falls back to default';
  assert (select deleted_at is not null from public.products where id = 'prod_del'), 'DELETE op soft-deletes';
  assert (select count(*) from public.tombstones where entity_id = 'prod_del' and reason = 'DELETED') = 1, 'tombstone kept';
  assert (select superseded_by from public.daily_closings where id = 'dc_a') = 'dc_b', 'older closing superseded by latest';
  assert (select superseded_by is null from public.daily_closings where id = 'dc_b'), 'latest closing wins';
  -- re-running from scratch is idempotent
  perform public.sync_backfill_reset();
  r := public.sync_backfill(1000);
  assert (select count(*) from public.invoices) = 2, 'backfill idempotent';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Reconcile: orphan blocks "clean"; mismatched invoice is flagged, not fixed
-- ---------------------------------------------------------------------------
do $$
declare r jsonb;
begin
  r := public.sync_reconcile();
  assert not (r ->> 'clean')::boolean, 'quarantine must make reconcile unclean';
  assert (r -> 'invariants' ->> 'invoice_mismatches')::int = 1, 'inv_bad flagged: ' || (r -> 'invariants')::text;
  assert (select legacy_mismatch from public.invoices where id = 'inv_bad'), 'flag stored';
  assert (select total_paise from public.invoices where id = 'inv_bad') = 900, 'data not silently fixed';
  assert (select count(*) from jsonb_array_elements(r -> 'entities') e
          where e ->> 'entity_type' = 'invoice_item' and (e ->> 'quarantined')::int = 1) = 1, 'quarantine reported';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Dual-write: the missing parent arrives through the live push path
-- ---------------------------------------------------------------------------
update public.feature_flags set enabled = true where key = 'dual_write';
do $$
declare r jsonb; rec jsonb;
begin
  r := public.sync_apply_batch(jsonb_build_array(
    jsonb_build_object('mutation_id', 'm1', 'entity_type', 'invoice', 'entity_id', 'inv_missing', 'operation', 'CREATE',
      'payload', '{"id":"inv_missing","business_id":"biz-rest","invoice_number":"R-3","invoice_type":"RESTAURANT","business_date":"2026-08-03","subtotal_paise":3000,"discount_paise":0,"tax_paise":0,"total_paise":3000,"paid_amount_paise":0,"balance_amount_paise":3000,"payment_status":"UNPAID","status":"ISSUED","notes":"","created_at":"2026-08-03T05:00:00.000Z","updated_at":"2026-08-03T05:00:00.000Z","deleted_at":null,"device_id":"devB","version":1}')
  ), 'devB', 'test');
  assert r -> 0 ->> 'status' = 'SYNCED', 'push ok: ' || r::text;
  assert (select count(*) from public.migration_quarantine) = 0, 'quarantined child retried after parent arrived';
  assert (select count(*) from public.sync_records where entity_id = 'inv_missing') = 1, 'legacy row written in same txn';
  r := public.sync_reconcile();
  assert (r ->> 'clean')::boolean, 'reconcile clean after parent arrives: ' || r::text;
end $$;

-- Idempotent retry: same mutation id twice does not write twice
do $$
declare r jsonb; seq_before bigint; seq_after bigint;
begin
  select change_seq into seq_before from public.invoices where id = 'inv_missing';
  r := public.sync_apply_batch('[{"mutation_id":"m1","entity_type":"invoice","entity_id":"inv_missing","operation":"CREATE","payload":"{\"id\":\"inv_missing\",\"version\":1}"}]'::jsonb, 'devB', 'test');
  assert r -> 0 ->> 'status' = 'SYNCED' and (r -> 0 ->> 'duplicate')::boolean, 'duplicate acked: ' || r::text;
  select change_seq into seq_after from public.invoices where id = 'inv_missing';
  assert seq_before = seq_after, 'duplicate did not rewrite the row';
end $$;

-- Payload sent as JSON text (the format legacy clients use) works too
do $$
declare r jsonb;
begin
  r := public.sync_apply_batch('[{"entity_type":"customer","entity_id":"cust_2","operation":"CREATE","payload":"{\"id\":\"cust_2\",\"name\":\"Ravi\",\"version\":1,\"updated_at\":\"2026-08-05T00:00:00.000Z\"}"}]'::jsonb, null, null);
  assert r -> 0 ->> 'status' = 'SYNCED', r::text;
  assert (select name from public.customers where id = 'cust_2') = 'Ravi';
end $$;

-- Conflict rule (decision 1): stale financial edit from another device -> CONFLICT, nothing written
do $$
declare r jsonb;
begin
  r := public.sync_apply_batch('[{"mutation_id":"m2","entity_type":"invoice","entity_id":"inv_1","operation":"UPDATE","payload":{"id":"inv_1","status":"VOIDED","version":2,"device_id":"devA","updated_at":"2026-08-04T00:00:00.000Z"}}]'::jsonb, 'devA', 'test');
  assert r -> 0 ->> 'status' = 'SYNCED';
  r := public.sync_apply_batch('[{"mutation_id":"m3","entity_type":"invoice","entity_id":"inv_1","operation":"UPDATE","payload":{"id":"inv_1","notes":"stale","version":1,"device_id":"devB","updated_at":"2026-08-04T01:00:00.000Z"}}]'::jsonb, 'devB', 'test');
  assert r -> 0 ->> 'status' = 'CONFLICT', 'stale cross-device financial edit conflicts: ' || r::text;
  assert ((r -> 0 ->> 'remote_payload')::jsonb ->> 'status') = 'VOIDED', 'remote payload returned';
  assert (select notes from public.invoices where id = 'inv_1') = '', 'stale edit not applied';
  assert (select coalesce(payload ->> 'notes', '') from public.sync_records where entity_id = 'inv_1') <> 'stale', 'legacy not overwritten either';
  -- same device sending an older copy (late retry) is acked, not a conflict
  r := public.sync_apply_batch('[{"mutation_id":"m4","entity_type":"invoice","entity_id":"inv_1","operation":"UPDATE","payload":{"id":"inv_1","version":1,"device_id":"devA"}}]'::jsonb, 'devA', 'test');
  assert r -> 0 ->> 'status' = 'SYNCED' and r -> 0 ->> 'applied' = 'SUPERSEDED', r::text;
  -- catalog rows: last writer wins, an older copy is ignored silently
  r := public.sync_apply_batch('[{"entity_type":"customer","entity_id":"cust_2","operation":"UPDATE","payload":{"id":"cust_2","name":"Old","version":1,"device_id":"devC","updated_at":"2026-08-01T00:00:00.000Z"}}]'::jsonb, 'devC', 'test');
  assert r -> 0 ->> 'applied' = 'SUPERSEDED', r::text;
  assert (select name from public.customers where id = 'cust_2') = 'Ravi';
end $$;

-- A bad item fails alone; the rest of the batch commits
do $$
declare r jsonb;
begin
  r := public.sync_apply_batch('[
    {"mutation_id":"m5","entity_type":"expense","entity_id":"exp_2","operation":"CREATE","payload":{"id":"exp_2","business_id":"biz-rest","amount_paise":500,"business_date":"2026-08-06","payment_method":"CASH","version":1}},
    {"mutation_id":"m6","entity_type":"payment","entity_id":"pay_bad","operation":"CREATE","payload":{"id":"pay_bad","business_id":"biz-rest","amount_paise":"lots","method":"CASH","business_date":"2026-08-06","version":1}}
  ]'::jsonb, 'devA', 'test');
  assert r -> 0 ->> 'status' = 'SYNCED', r::text;
  assert r -> 1 ->> 'status' = 'SYNCED' and r -> 1 ->> 'note' like 'QUARANTINED%', 'bad value quarantined, legacy kept: ' || r::text;
  assert (select count(*) from public.expenses where id = 'exp_2') = 1;
  delete from public.migration_quarantine where entity_id = 'pay_bad';
  delete from public.sync_records where entity_id = 'pay_bad';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Cursor pull: complete, ordered, paginated, ISO timestamps, purge tombstones
-- ---------------------------------------------------------------------------
do $$
declare r jsonb; cur bigint := 0; total int := 0; pages int := 0; last_seq bigint := 0; x jsonb;
begin
  loop
    r := public.sync_pull(cur, 4, 'devZ');
    pages := pages + 1;
    for x in select * from jsonb_array_elements(r -> 'records') loop
      assert (x ->> 'change_seq')::bigint > last_seq, 'strictly increasing seq';
      last_seq := (x ->> 'change_seq')::bigint;
      total := total + 1;
    end loop;
    cur := (r ->> 'next_cursor')::bigint;
    exit when not (r ->> 'has_more')::boolean;
    if pages > 100 then raise exception 'pull did not terminate'; end if;
  end loop;
  assert total = (select sum(n) from (
      select count(*) n from public.customers union all select count(*) from public.orders union all
      select count(*) from public.order_items union all select count(*) from public.invoices union all
      select count(*) from public.invoice_items union all select count(*) from public.payments union all
      select count(*) from public.expenses union all select count(*) from public.daily_closings union all
      select count(*) from public.products) s), 'every row pulled exactly once, got ' || total;
  perform public.sync_ack_cursor('devZ', cur, 'test');
  r := public.sync_pull(cur, 100, 'devZ');
  assert jsonb_array_length(r -> 'records') = 0, 'nothing after the end cursor';

  r := public.sync_pull(0, 1000, 'devZ');
  select x2 into x from jsonb_array_elements(r -> 'records') x2 where x2 ->> 'entity_id' = 'inv_1';
  assert x -> 'payload' ->> 'updated_at' = '2026-08-04T00:00:00.000Z', 'ISO ms Z timestamps: ' || (x -> 'payload')::text;
  assert x -> 'payload' ->> 'future_field' = 'kept', 'extra merged back';
  assert not (x -> 'payload' ? 'change_seq'), 'server columns hidden';
  select x2 into x from jsonb_array_elements(r -> 'records') x2 where x2 ->> 'entity_id' = 'prod_del';
  assert x ->> 'operation' = 'DELETE', 'soft delete pulled as DELETE';

  -- hard delete (archive purge) leaves an ARCHIVED tombstone that is pulled as PURGE
  delete from public.expenses where id = 'exp_2';
  r := public.sync_pull(cur, 100, 'devZ');
  assert jsonb_array_length(r -> 'records') = 1 and r -> 'records' -> 0 ->> 'operation' = 'PURGE', 'purge pulled: ' || r::text;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Security: anon cannot read financial tables or call sync functions
-- ---------------------------------------------------------------------------
do $$
begin
  assert not has_function_privilege('anon', 'public.sync_apply_batch(jsonb,text,text)', 'execute'), 'anon cannot push';
  assert not has_function_privilege('anon', 'public.sync_pull(bigint,integer,text)', 'execute'), 'anon cannot pull';
  assert (select relrowsecurity from pg_class where oid = 'public.invoices'::regclass), 'RLS on invoices';
end $$;

select 'sync tests passed' as result;
