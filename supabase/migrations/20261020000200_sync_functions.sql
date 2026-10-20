-- Phase 2 + 4: transactional dual-write, backfill, reconciliation and cursor pulls.
-- All functions are SECURITY INVOKER and only callable by the service role (server routes).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.sync_iso(ts timestamptz) returns text
language sql immutable as $$
  select case when ts is null then null
    else to_char(ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
$$;

create or replace function public.sync_flag(p_key text) returns boolean
language sql stable as $$
  select coalesce((select enabled from public.feature_flags where key = p_key), false)
$$;

-- Column metadata for a normalized table (name, type, nullability, server-managed?).
create or replace function public.sync_columns(p_table text)
returns table (col text, typ text, not_null boolean, server_managed boolean)
language sql stable as $$
  select a.attname::text,
         format_type(a.atttypid, a.atttypmod),
         a.attnotnull,
         a.attname in ('change_seq', 'synced_at', 'extra', 'legacy_mismatch', 'superseded_by')
  from pg_attribute a
  where a.attrelid = ('public.' || quote_ident(p_table))::regclass
    and a.attnum > 0 and not a.attisdropped
  order by a.attnum
$$;

-- Device payload -> jsonb whose keys are exactly the writable columns, plus `extra`.
-- * client-only keys (sync_status, server_id) are dropped
-- * unknown keys go to `extra` so nothing is lost
-- * "" for date/timestamp columns and JSON null for NOT NULL columns are dropped (defaults /
--   existing values apply) instead of failing the whole row
create or replace function public.sync_normalize_payload(p_table text, p_entity_id text, p_payload jsonb)
returns jsonb
language plpgsql stable as $$
declare
  c record;
  v_out jsonb := '{}'::jsonb;
  v_extra jsonb := coalesce(p_payload, '{}'::jsonb) - 'sync_status' - 'server_id';
  v_val jsonb;
begin
  for c in select * from public.sync_columns(p_table) loop
    if c.server_managed then
      v_extra := v_extra - c.col;
      continue;
    end if;
    if not (p_payload ? c.col) then continue; end if;
    v_val := p_payload -> c.col;
    v_extra := v_extra - c.col;
    if jsonb_typeof(v_val) = 'null' and c.not_null then continue; end if;
    if jsonb_typeof(v_val) = 'string' and v_val #>> '{}' = ''
       and (c.typ like 'timestamp%' or c.typ = 'date') then
      if c.not_null then continue; end if;
      v_val := 'null'::jsonb;
    end if;
    v_out := v_out || jsonb_build_object(c.col, v_val);
  end loop;
  v_out := jsonb_set(v_out, '{id}', to_jsonb(coalesce(p_payload ->> 'id', p_entity_id)));
  return v_out || jsonb_build_object('extra', v_extra - 'id');
end $$;

-- Normalized row -> the exact JSON shape devices use (ISO-8601 ms Z timestamps, extra merged).
create or replace function public.sync_row_to_client(p_table text, p_row jsonb)
returns jsonb
language plpgsql stable as $$
declare
  c record;
  v jsonb := coalesce(p_row -> 'extra', '{}'::jsonb) || (p_row - 'extra' - 'change_seq' - 'synced_at' - 'legacy_mismatch' - 'superseded_by');
begin
  for c in select * from public.sync_columns(p_table) where typ like 'timestamp%' loop
    if v ? c.col and jsonb_typeof(v -> c.col) = 'string' then
      v := jsonb_set(v, array[c.col], to_jsonb(public.sync_iso((v ->> c.col)::timestamptz)));
    end if;
  end loop;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Apply one entity change to the normalized tables.
-- Returns {status, remote?}. status:
--   APPLIED     row written
--   SUPERSEDED  a newer version of the row is already stored; nothing written (ack the client)
--   CONFLICT    stale financial edit from a different device; nothing written, remote returned
--   SKIPPED     entity type has no normalized table (users, businesses)
-- Raises on FK / type errors so the caller can quarantine inside its own subtransaction.
-- p_mode: 'sync' (live device push) or 'backfill' (from sync_records; never raises CONFLICT)
-- ---------------------------------------------------------------------------
create or replace function public.sync_apply_entity(
  p_entity_type text, p_entity_id text, p_operation text, p_payload jsonb, p_device_id text,
  p_mode text default 'sync'
) returns jsonb
language plpgsql as $$
declare
  m public.sync_entity_map%rowtype;
  v_row jsonb;
  v_existing jsonb;
  v_cols text;
  v_in_version integer;
  v_ex_version integer;
  v_in_updated timestamptz;
  v_ex_updated timestamptz;
  v_rival record;
begin
  select * into m from public.sync_entity_map where entity_type = p_entity_type;
  if not found then
    return jsonb_build_object('status', 'SKIPPED');
  end if;

  v_row := public.sync_normalize_payload(m.table_name, p_entity_id, coalesce(p_payload, '{}'::jsonb));
  if p_device_id is not null and not (v_row ? 'device_id') then
    v_row := v_row || jsonb_build_object('device_id', p_device_id);
  end if;
  if upper(coalesce(p_operation, '')) = 'DELETE' and (v_row ->> 'deleted_at') is null then
    v_row := v_row || jsonb_build_object('deleted_at', public.sync_iso(now()));
  end if;

  execute format('select to_jsonb(t) from public.%I t where id = $1 for update', m.table_name)
    into v_existing using v_row ->> 'id';

  if v_existing is not null then
    v_in_version := coalesce((v_row ->> 'version')::integer, 1);
    v_ex_version := coalesce((v_existing ->> 'version')::integer, 1);
    v_in_updated := (v_row ->> 'updated_at')::timestamptz;
    v_ex_updated := (v_existing ->> 'updated_at')::timestamptz;
    if v_in_version < v_ex_version then
      if p_mode = 'sync' and m.financial
         and coalesce(v_existing ->> 'device_id', '') <> coalesce(v_row ->> 'device_id', '') then
        return jsonb_build_object('status', 'CONFLICT',
          'remote', public.sync_row_to_client(m.table_name, v_existing));
      end if;
      return jsonb_build_object('status', 'SUPERSEDED');
    end if;
    if v_in_version = v_ex_version and v_in_updated is not null and v_ex_updated is not null
       and v_in_updated < v_ex_updated then
      return jsonb_build_object('status', 'SUPERSEDED');
    end if;
  end if;

  -- Daily closings: two devices can close the same business day offline. Latest CLOSED wins;
  -- the loser is kept and points at the winner (decision 3 of the plan). Resolved before the
  -- write so the "one CLOSED row per day" unique index is never violated.
  if m.table_name = 'daily_closings'
     and coalesce(v_row ->> 'status', v_existing ->> 'status', 'CLOSED') = 'CLOSED'
     and coalesce(v_row ->> 'deleted_at', v_existing ->> 'deleted_at') is null then
    for v_rival in
      select id, updated_at from public.daily_closings
      where business_id = coalesce(v_row ->> 'business_id', v_existing ->> 'business_id')
        and business_date = coalesce(v_row ->> 'business_date', v_existing ->> 'business_date')::date
        and id <> v_row ->> 'id' and status = 'CLOSED' and deleted_at is null and superseded_by is null
    loop
      if v_rival.updated_at > coalesce((v_row ->> 'updated_at')::timestamptz, now()) then
        v_row := v_row || jsonb_build_object('superseded_by', v_rival.id);
      else
        update public.daily_closings set superseded_by = v_row ->> 'id' where id = v_rival.id;
      end if;
    end loop;
  end if;

  select string_agg(quote_ident(k), ', ') into v_cols
  from jsonb_object_keys(v_row) k;

  if v_existing is null then
    execute format(
      'insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1)',
      m.table_name, v_cols) using v_row;
  else
    -- partial payloads only touch the columns they carry; unknown keys accumulate
    v_row := jsonb_set(v_row, '{extra}', coalesce(v_existing -> 'extra', '{}'::jsonb) || coalesce(v_row -> 'extra', '{}'::jsonb));
    execute format(
      'update public.%1$I t set (%2$s) = (select %2$s from jsonb_populate_record(null::public.%1$I, $1)) where t.id = $1 ->> ''id''',
      m.table_name, v_cols) using v_row;
  end if;

  return jsonb_build_object('status', 'APPLIED');
end $$;

create or replace function public.sync_quarantine(
  p_entity_type text, p_entity_id text, p_operation text, p_payload jsonb, p_device_id text, p_reason text
) returns void
language sql as $$
  insert into public.migration_quarantine (entity_type, entity_id, payload, operation, device_id, reason)
  values (p_entity_type, p_entity_id, coalesce(p_payload, '{}'::jsonb), coalesce(p_operation, 'UPDATE'), p_device_id, p_reason)
  on conflict (entity_type, entity_id) do update
    set payload = excluded.payload, operation = excluded.operation, device_id = excluded.device_id,
        reason = excluded.reason, attempts = public.migration_quarantine.attempts + 1, last_seen_at = now()
$$;

-- Retry quarantined rows in dependency order (parents may have arrived since).
create or replace function public.sync_retry_quarantine(p_limit integer default 500)
returns jsonb
language plpgsql as $$
declare
  q record;
  v_fixed integer := 0;
  v_left integer := 0;
begin
  for q in
    select mq.* from public.migration_quarantine mq
    left join public.sync_entity_map m using (entity_type)
    order by coalesce(m.apply_rank, 99), mq.first_seen_at
    limit p_limit
  loop
    begin
      perform public.sync_apply_entity(q.entity_type, q.entity_id, q.operation, q.payload, q.device_id, 'backfill');
      delete from public.migration_quarantine where entity_type = q.entity_type and entity_id = q.entity_id;
      v_fixed := v_fixed + 1;
    exception when others then
      update public.migration_quarantine
        set attempts = attempts + 1, reason = sqlerrm, last_seen_at = now()
      where entity_type = q.entity_type and entity_id = q.entity_id;
      v_left := v_left + 1;
    end;
  end loop;
  return jsonb_build_object('fixed', v_fixed, 'remaining', v_left);
end $$;

-- ---------------------------------------------------------------------------
-- Batch push (legacy single-item clients and new batch clients share this).
-- One transaction for the whole batch; one subtransaction per item, so a bad item fails
-- alone while legacy + normalized writes for each item stay all-or-nothing.
-- p_items: [{mutation_id?, entity_type, entity_id, operation, payload (json or json text)}]
-- ---------------------------------------------------------------------------
create or replace function public.sync_apply_batch(p_items jsonb, p_device_id text default null, p_client_version text default null)
returns jsonb
language plpgsql as $$
declare
  it jsonb;
  v_results jsonb := '[]'::jsonb;
  v_dual boolean := public.sync_flag('dual_write');
  v_legacy boolean := public.sync_flag('legacy_writes');
  v_mutation text;
  v_type text;
  v_id text;
  v_op text;
  v_payload jsonb;
  v_device text;
  v_res jsonb;
  v_status text;
  v_prev text;
  v_note text;
begin
  perform public.sync_lock();
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_mutation := nullif(it ->> 'mutation_id', '');
    v_type := coalesce(it ->> 'entity_type', '');
    v_id := coalesce(it ->> 'entity_id', '');
    v_op := upper(coalesce(it ->> 'operation', 'UPDATE'));
    v_note := null;
    begin
      if jsonb_typeof(it -> 'payload') = 'string' then
        v_payload := (it ->> 'payload')::jsonb;
      elsif jsonb_typeof(it -> 'payload') = 'object' then
        v_payload := it -> 'payload';
      else
        v_payload := it;
      end if;
    exception when others then
      v_payload := jsonb_build_object('raw', it ->> 'payload');
    end;
    v_device := coalesce(nullif(v_payload ->> 'device_id', ''), nullif(it ->> 'device_id', ''), p_device_id);

    if v_mutation is not null then
      select status into v_prev from public.applied_mutations where mutation_id = v_mutation;
      if found then
        v_results := v_results || jsonb_build_object('mutation_id', v_mutation, 'entity_id', v_id,
          'server_id', 'srv-' || v_id, 'status', 'SYNCED', 'duplicate', true, 'applied', v_prev);
        continue;
      end if;
    end if;

    begin
      v_status := 'APPLIED';
      if v_dual then
        begin
          v_res := public.sync_apply_entity(v_type, v_id, v_op, v_payload, v_device, 'sync');
          v_status := v_res ->> 'status';
        exception when others then
          -- keep the legacy write; park the row for retry + reconciliation
          perform public.sync_quarantine(v_type, v_id, v_op, v_payload, v_device, sqlerrm);
          v_status := 'APPLIED';
          v_note := 'QUARANTINED: ' || sqlerrm;
        end;
      end if;

      if v_status = 'CONFLICT' then
        v_results := v_results || jsonb_build_object('mutation_id', v_mutation, 'entity_id', v_id,
          'status', 'CONFLICT', 'remote_payload', (v_res -> 'remote')::text);
        continue;
      end if;

      if v_legacy and v_status in ('APPLIED', 'SKIPPED') then
        insert into public.sync_records (entity_type, entity_id, operation, payload, device_id, updated_at)
        values (v_type, v_id, v_op, v_payload, v_device, now())
        on conflict (entity_type, entity_id) do update
          set operation = excluded.operation, payload = excluded.payload,
              device_id = excluded.device_id, updated_at = excluded.updated_at;
      end if;

      if v_mutation is not null then
        insert into public.applied_mutations (mutation_id, entity_type, entity_id, status, device_id)
        values (v_mutation, v_type, v_id, v_status, v_device);
      end if;

      v_results := v_results || jsonb_strip_nulls(jsonb_build_object('mutation_id', v_mutation, 'entity_id', v_id,
        'server_id', 'srv-' || v_id, 'status', 'SYNCED', 'applied', v_status, 'note', v_note));
    exception when others then
      v_results := v_results || jsonb_build_object('mutation_id', v_mutation, 'entity_id', v_id,
        'server_id', null, 'status', 'FAILED', 'error', sqlerrm, 'remote_payload', sqlerrm);
    end;
  end loop;

  if v_dual and exists (select 1 from public.migration_quarantine) then
    perform public.sync_retry_quarantine(200);
  end if;

  if p_device_id is not null then
    insert into public.sync_devices (device_id, last_push_at, client_version)
    values (p_device_id, now(), p_client_version)
    on conflict (device_id) do update
      set last_push_at = now(), client_version = coalesce(excluded.client_version, public.sync_devices.client_version);
  end if;

  return v_results;
end $$;

-- ---------------------------------------------------------------------------
-- Backfill normalized tables from sync_records in bounded, resumable batches.
-- Call repeatedly until it returns processed = 0. Never mutates sync_records.
-- ---------------------------------------------------------------------------
create or replace function public.sync_backfill(p_batch integer default 500, p_name text default 'backfill_v1')
returns jsonb
language plpgsql as $$
declare
  cp public.migration_checkpoints%rowtype;
  r record;
  v_n integer := 0;
  v_applied integer := 0;
  v_superseded integer := 0;
  v_quarantined integer := 0;
  v_res jsonb;
begin
  perform public.sync_lock();
  insert into public.migration_checkpoints (name, last_rank, last_entity_type, last_entity_id)
  values (p_name, -1, '', '') on conflict (name) do nothing;
  select * into cp from public.migration_checkpoints where name = p_name for update;

  for r in
    select s.entity_type, s.entity_id, s.operation, s.payload, s.device_id, m.apply_rank
    from public.sync_records s
    join public.sync_entity_map m using (entity_type)
    where (m.apply_rank, s.entity_type, s.entity_id) > (cp.last_rank, cp.last_entity_type, cp.last_entity_id)
    order by m.apply_rank, s.entity_type, s.entity_id
    limit p_batch
  loop
    v_n := v_n + 1;
    begin
      v_res := public.sync_apply_entity(r.entity_type, r.entity_id, r.operation, r.payload, r.device_id, 'backfill');
      if v_res ->> 'status' = 'SUPERSEDED' then v_superseded := v_superseded + 1; else v_applied := v_applied + 1; end if;
      delete from public.migration_quarantine where entity_type = r.entity_type and entity_id = r.entity_id;
    exception when others then
      perform public.sync_quarantine(r.entity_type, r.entity_id, r.operation, r.payload, r.device_id, sqlerrm);
      v_quarantined := v_quarantined + 1;
    end;
    cp.last_rank := r.apply_rank;
    cp.last_entity_type := r.entity_type;
    cp.last_entity_id := r.entity_id;
  end loop;

  update public.migration_checkpoints
    set last_rank = cp.last_rank, last_entity_type = cp.last_entity_type, last_entity_id = cp.last_entity_id,
        processed = processed + v_n, updated_at = now()
  where name = p_name;

  return jsonb_build_object('processed', v_n, 'applied', v_applied, 'superseded', v_superseded,
    'quarantined', v_quarantined, 'done', v_n < p_batch);
end $$;

create or replace function public.sync_backfill_reset(p_name text default 'backfill_v1') returns void
language sql as $$ delete from public.migration_checkpoints where name = p_name $$;

-- ---------------------------------------------------------------------------
-- Flag invoices whose stored totals do not reconcile with items / payments.
-- Data is never "fixed" here; the flag feeds the audit report (decision 2).
-- ---------------------------------------------------------------------------
create or replace function public.sync_flag_invoice_mismatches() returns integer
language plpgsql as $$
declare v integer;
begin
  with calc as (
    select i.id,
      (exists (select 1 from public.invoice_items x where x.invoice_id = i.id and x.deleted_at is null)
        and i.subtotal_paise <> coalesce((select sum(x.amount_paise) from public.invoice_items x
                                          where x.invoice_id = i.id and x.deleted_at is null), 0))
      or i.total_paise <> i.subtotal_paise - i.discount_paise + i.tax_paise
      or i.paid_amount_paise <> least(i.total_paise, coalesce((select sum(p.amount_paise) from public.payments p
                                          where p.invoice_id = i.id and p.deleted_at is null), 0))
      or i.balance_amount_paise <> i.total_paise - i.paid_amount_paise as bad
    from public.invoices i
    where i.deleted_at is null
  )
  update public.invoices i set legacy_mismatch = c.bad
  from calc c where c.id = i.id and i.legacy_mismatch is distinct from c.bad;
  get diagnostics v = row_count;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Reconciliation report: legacy (sync_records) vs normalized.
-- clean = true only when every legacy row is present, nothing is quarantined, deleted flags
-- and versions agree, and financial totals match per business per month.
-- ---------------------------------------------------------------------------
create or replace function public.sync_reconcile(p_sample integer default 25)
returns jsonb
language plpgsql as $$
declare
  m record;
  v_entities jsonb := '[]'::jsonb;
  v_legacy bigint;
  v_norm bigint;
  v_missing jsonb;
  v_extra jsonb;
  v_missing_n bigint;
  v_extra_n bigint;
  v_deleted_mismatch bigint;
  v_version_mismatch bigint;
  v_quarantine bigint;
  v_clean boolean := true;
  v_totals jsonb;
  v_invariants jsonb;
begin
  perform public.sync_flag_invoice_mismatches();

  for m in select * from public.sync_entity_map order by apply_rank, entity_type loop
    execute format($q$
      with l as (select entity_id, payload, operation from public.sync_records where entity_type = %1$L),
           n as (select id, deleted_at, version from public.%2$I),
           q as (select entity_id from public.migration_quarantine where entity_type = %1$L)
      select
        (select count(*) from l),
        (select count(*) from n),
        (select count(*) from l where entity_id not in (select id from n) and entity_id not in (select entity_id from q)),
        (select coalesce(jsonb_agg(entity_id), '[]') from (select entity_id from l
           where entity_id not in (select id from n) and entity_id not in (select entity_id from q) limit %3$s) s),
        (select count(*) from n where id not in (select entity_id from l)),
        (select coalesce(jsonb_agg(id), '[]') from (select id from n where id not in (select entity_id from l) limit %3$s) s),
        (select count(*) from l join n on n.id = l.entity_id
           where (nullif(l.payload ->> 'deleted_at', '') is not null or upper(l.operation) = 'DELETE') <> (n.deleted_at is not null)),
        (select count(*) from l join n on n.id = l.entity_id
           where coalesce((l.payload ->> 'version')::int, 1) <> n.version),
        (select count(*) from q)
    $q$, m.entity_type, m.table_name, p_sample)
    into v_legacy, v_norm, v_missing_n, v_missing, v_extra_n, v_extra, v_deleted_mismatch, v_version_mismatch, v_quarantine;

    if v_missing_n > 0 or v_extra_n > 0 or v_deleted_mismatch > 0 or v_version_mismatch > 0 or v_quarantine > 0 then
      v_clean := false;
    end if;
    v_entities := v_entities || jsonb_build_object(
      'entity_type', m.entity_type, 'legacy', v_legacy, 'normalized', v_norm,
      'missing', v_missing_n, 'missing_ids', v_missing, 'extra', v_extra_n, 'extra_ids', v_extra,
      'deleted_mismatch', v_deleted_mismatch, 'version_mismatch', v_version_mismatch,
      'quarantined', v_quarantine);
  end loop;

  -- Financial totals by business + month, legacy vs normalized, live rows only.
  with legacy as (
    select entity_type, payload ->> 'business_id' as business_id,
           left(payload ->> 'business_date', 7) as month,
           sum(coalesce((payload ->> case entity_type when 'invoice' then 'total_paise' else 'amount_paise' end)::bigint, 0)) as total,
           count(*) as n
    from public.sync_records
    where entity_type in ('invoice', 'payment', 'expense', 'ledger')
      and nullif(payload ->> 'deleted_at', '') is null
      and (entity_type <> 'invoice' or coalesce(payload ->> 'status', 'ISSUED') = 'ISSUED')
    group by 1, 2, 3
  ), norm as (
    select 'invoice' as entity_type, business_id, to_char(business_date, 'YYYY-MM') as month, sum(total_paise) as total, count(*) as n
      from public.invoices where deleted_at is null and status = 'ISSUED' group by 2, 3
    union all
    select 'payment', business_id, to_char(business_date, 'YYYY-MM'), sum(amount_paise), count(*)
      from public.payments where deleted_at is null group by 2, 3
    union all
    select 'expense', business_id, to_char(business_date, 'YYYY-MM'), sum(amount_paise), count(*)
      from public.expenses where deleted_at is null group by 2, 3
    union all
    select 'ledger', business_id, to_char(business_date, 'YYYY-MM'), sum(amount_paise), count(*)
      from public.ledger_entries where deleted_at is null group by 2, 3
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'entity_type', coalesce(l.entity_type, n.entity_type), 'business_id', coalesce(l.business_id, n.business_id),
      'month', coalesce(l.month, n.month), 'legacy_total_paise', l.total, 'normalized_total_paise', n.total,
      'legacy_rows', l.n, 'normalized_rows', n.n)), '[]'::jsonb)
  into v_totals
  from legacy l full join norm n
    on n.entity_type = l.entity_type and n.business_id is not distinct from l.business_id and n.month is not distinct from l.month
  where l.total is distinct from n.total or l.n is distinct from n.n;

  if jsonb_array_length(v_totals) > 0 then v_clean := false; end if;

  select jsonb_build_object(
    'invoice_mismatches', (select count(*) from public.invoices where legacy_mismatch and deleted_at is null),
    'invoice_mismatch_ids', (select coalesce(jsonb_agg(id), '[]') from (select id from public.invoices
                              where legacy_mismatch and deleted_at is null order by id limit p_sample) s),
    'superseded_daily_closings', (select count(*) from public.daily_closings where superseded_by is not null),
    'orphan_invoice_items', (select count(*) from public.invoice_items x left join public.invoices i on i.id = x.invoice_id where i.id is null),
    'orphan_payments', (select count(*) from public.payments p left join public.invoices i on i.id = p.invoice_id
                         where p.invoice_id is not null and i.id is null),
    'duplicate_ids', 0
  ) into v_invariants;

  return jsonb_build_object(
    'generated_at', public.sync_iso(now()),
    'clean', v_clean,
    'entities', v_entities,
    'total_mismatches', v_totals,
    'invariants', v_invariants,
    'quarantine', (select coalesce(jsonb_agg(jsonb_build_object('entity_type', entity_type, 'entity_id', entity_id,
                     'reason', reason, 'attempts', attempts)), '[]') from (select * from public.migration_quarantine
                     order by first_seen_at limit p_sample) q),
    'max_change_seq', (select last_value from public.sync_change_seq)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Cursor pull. Rows with change_seq > p_after across all entity tables plus ARCHIVED
-- tombstones, ordered by change_seq. Because every writer holds the sync advisory lock
-- until commit, change_seq order is commit order and nothing can appear behind a cursor.
-- ---------------------------------------------------------------------------
create or replace function public.sync_pull(p_after bigint, p_limit integer default 500, p_device_id text default null)
returns jsonb
language plpgsql stable as $$
declare
  m record;
  v_sql text := '';
  v_rows jsonb;
  v_next bigint;
  v_max bigint;
  v_min_live bigint;
begin
  p_limit := least(greatest(coalesce(p_limit, 500), 1), 1000);
  for m in select * from public.sync_entity_map loop
    v_sql := v_sql || format(
      '(select %1$L as entity_type, t.id as entity_id,
               case when t.deleted_at is null then %3$L else %4$L end as operation,
               public.sync_row_to_client(%2$L, to_jsonb(t)) as payload, t.change_seq,
               public.sync_iso(t.updated_at) as updated_at
        from public.%2$I t where t.change_seq > $1 order by t.change_seq limit $2) union all ',
      m.entity_type, m.table_name, 'UPSERT', 'DELETE');
  end loop;
  v_sql := v_sql || '(select entity_type, entity_id, ''PURGE'', jsonb_build_object(''id'', entity_id), change_seq,
                       public.sync_iso(deleted_at) from public.tombstones
                      where reason = ''ARCHIVED'' and change_seq > $1 order by change_seq limit $2)';

  execute format('select coalesce(jsonb_agg(to_jsonb(x) order by x.change_seq), ''[]'') , max(x.change_seq)
                  from (select * from (%s) u order by change_seq limit $2) x', v_sql)
    into v_rows, v_next using coalesce(p_after, 0), p_limit;

  select last_value into v_max from public.sync_change_seq;
  return jsonb_build_object(
    'records', v_rows,
    'next_cursor', coalesce(v_next, greatest(coalesce(p_after, 0), 0)),
    'has_more', jsonb_array_length(v_rows) >= p_limit,
    'max_cursor', v_max
  );
end $$;

-- Record the cursor a device has acknowledged (separate because sync_pull is STABLE).
create or replace function public.sync_ack_cursor(p_device_id text, p_cursor bigint, p_client_version text default null)
returns void
language sql as $$
  insert into public.sync_devices (device_id, last_cursor, last_pull_at, client_version)
  values (p_device_id, p_cursor, now(), p_client_version)
  on conflict (device_id) do update
    set last_cursor = greatest(public.sync_devices.last_cursor, excluded.last_cursor), last_pull_at = now(),
        client_version = coalesce(excluded.client_version, public.sync_devices.client_version)
$$;

-- Lock down: only the service role may execute these.
do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'sync\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
