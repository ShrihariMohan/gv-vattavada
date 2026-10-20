-- Phase 0 baseline (READ-ONLY). Works on the legacy schema, before any migration.
-- Run against production and against every restored copy; the JSON outputs must be identical
-- (except generated_at and database_bytes).
--   psql "$PROD_DB_URL" -At -f scripts/migration/phase0-baseline.sql > baseline-prod.json
with live as (
  select entity_type, entity_id, operation, payload, device_id, updated_at,
         (nullif(payload ->> 'deleted_at', '') is not null or upper(operation) = 'DELETE') as deleted
  from public.sync_records
)
select jsonb_pretty(jsonb_build_object(
  'generated_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'schema_version', 'v1-json-sync',
  'database_bytes', pg_database_size(current_database()),
  'sync_records_total', (select count(*) from live),
  'by_entity', (select jsonb_object_agg(entity_type, jsonb_build_object(
      'rows', n, 'deleted', d, 'min_updated_at', mn, 'max_updated_at', mx))
    from (select entity_type, count(*) n, count(*) filter (where deleted) d,
                 min(updated_at)::text mn, max(updated_at)::text mx
          from live group by entity_type) s),
  'totals_paise_by_business_month', (select coalesce(jsonb_agg(t order by t.entity_type, t.business_id, t.month), '[]')
    from (select entity_type, payload ->> 'business_id' as business_id, left(payload ->> 'business_date', 7) as month,
                 count(*) as rows,
                 sum(coalesce((payload ->> case entity_type when 'invoice' then 'total_paise' else 'amount_paise' end)::bigint, 0)) as total_paise
          from live
          where entity_type in ('invoice', 'payment', 'expense', 'ledger') and not deleted
            and (entity_type <> 'invoice' or coalesce(payload ->> 'status', 'ISSUED') = 'ISSUED')
          group by 1, 2, 3) t),
  'devices', (select coalesce(jsonb_agg(d order by d.device_id), '[]')
    from (select device_id, count(*) as rows, max(updated_at)::text as last_write
          from live group by device_id) d),
  'businesses', (select coalesce(jsonb_agg(b.id order by b.id), '[]') from public.businesses b)
));
