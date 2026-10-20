-- Phase 0 data audit (READ-ONLY, legacy schema). Lists what the backfill will quarantine or flag
-- so decisions are made BEFORE the migration window.
--   psql "$PROD_DB_URL" -At -f scripts/migration/phase0-audit.sql > audit-prod.json
with r as (select entity_type, entity_id, payload from public.sync_records),
ids as (select entity_type, entity_id from r)
select jsonb_pretty(jsonb_build_object(
  'orphan_invoice_items', (select coalesce(jsonb_agg(entity_id), '[]') from r
     where entity_type = 'invoice_item'
       and not exists (select 1 from ids p where p.entity_type = 'invoice' and p.entity_id = r.payload ->> 'invoice_id')),
  'orphan_order_items', (select coalesce(jsonb_agg(entity_id), '[]') from r
     where entity_type = 'order_item'
       and not exists (select 1 from ids p where p.entity_type = 'order' and p.entity_id = r.payload ->> 'order_id')),
  'orphan_payments', (select coalesce(jsonb_agg(entity_id), '[]') from r
     where entity_type = 'payment' and nullif(r.payload ->> 'invoice_id', '') is not null
       and not exists (select 1 from ids p where p.entity_type = 'invoice' and p.entity_id = r.payload ->> 'invoice_id')),
  'orphan_invoice_orders', (select coalesce(jsonb_agg(entity_id), '[]') from r
     where entity_type = 'invoice' and nullif(r.payload ->> 'order_id', '') is not null
       and not exists (select 1 from ids p where p.entity_type = 'order' and p.entity_id = r.payload ->> 'order_id')),
  'orphan_invoice_bookings', (select coalesce(jsonb_agg(entity_id), '[]') from r
     where entity_type = 'invoice' and nullif(r.payload ->> 'booking_id', '') is not null
       and not exists (select 1 from ids p where p.entity_type = 'booking' and p.entity_id = r.payload ->> 'booking_id')),
  'orphan_booking_rooms', (select coalesce(jsonb_agg(entity_id), '[]') from r
     where entity_type = 'booking' and nullif(r.payload ->> 'room_id', '') is not null
       and not exists (select 1 from ids p where p.entity_type = 'room' and p.entity_id = r.payload ->> 'room_id')),
  'payload_id_mismatch', (select coalesce(jsonb_agg(entity_type || ':' || entity_id), '[]') from r
     where r.payload ? 'id' and r.payload ->> 'id' <> r.entity_id),
  'missing_business_date', (select coalesce(jsonb_agg(entity_type || ':' || entity_id), '[]') from r
     where entity_type in ('invoice', 'payment', 'expense', 'ledger', 'daily_closing')
       and coalesce(r.payload ->> 'business_date', '') !~ '^\d{4}-\d{2}-\d{2}'),
  'non_integer_money', (select coalesce(jsonb_agg(distinct entity_type || ':' || entity_id), '[]') from r,
       jsonb_each(r.payload) kv
     where kv.key like '%\_paise' and jsonb_typeof(kv.value) = 'number' and (kv.value #>> '{}') ~ '\.'),
  'invoice_total_formula_mismatch', (select coalesce(jsonb_agg(entity_id), '[]') from r
     where entity_type = 'invoice'
       and coalesce((payload ->> 'total_paise')::bigint, 0) <>
           coalesce((payload ->> 'subtotal_paise')::bigint, 0) - coalesce((payload ->> 'discount_paise')::bigint, 0)
           + coalesce((payload ->> 'tax_paise')::bigint, 0)),
  'duplicate_closed_days', (select coalesce(jsonb_agg(d), '[]') from (
       select payload ->> 'business_id' as business_id, payload ->> 'business_date' as business_date,
              jsonb_agg(entity_id order by payload ->> 'updated_at') as ids
       from r where entity_type = 'daily_closing' and coalesce(payload ->> 'status', 'CLOSED') = 'CLOSED'
         and nullif(payload ->> 'deleted_at', '') is null
       group by 1, 2 having count(*) > 1) d),
  'unknown_entity_types', (select coalesce(jsonb_agg(distinct entity_type), '[]') from r
     where entity_type not in ('customer','product_category','product','room','table','order','booking','order_item',
                               'invoice','invoice_item','payment','expense','ledger','daily_closing','shift','user','business'))
));
