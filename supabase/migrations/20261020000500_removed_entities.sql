-- Deliberate removal of rows that can never be normalized (e.g. orphans from the early app).
--
--  * tombstones gain reason REMOVED. Rows tombstoned as REMOVED or ARCHIVED are ignored by
--    sync_backfill and by the legacy side of sync_reconcile, and reach devices as PURGE through
--    sync_pull (devices on the legacy pull see the soft delete in sync_records instead).
--    This also fixes reconcile after a month is archived: legacy copies of purged rows are no
--    longer reported as "missing".
--  * sync_apply_batch acknowledges pushes of REMOVED rows without writing them again.
--  * sync_remove_entities(): one transaction that backs up, soft-deletes the legacy rows,
--    removes them from quarantine / normalized tables and writes REMOVED tombstones.

alter table public.tombstones drop constraint if exists tombstones_reason_check;
alter table public.tombstones add constraint tombstones_reason_check check (reason in ('DELETED', 'ARCHIVED', 'REMOVED'));

create table if not exists public.removed_entities_backup (
  removed_at timestamptz not null default now(),
  reason text not null,
  entity_type text not null,
  entity_id text not null,
  operation text,
  payload jsonb,
  device_id text,
  updated_at timestamptz,
  quarantine_reason text
);
alter table public.removed_entities_backup enable row level security;
drop policy if exists removed_entities_backup_no_anon on public.removed_entities_backup;
create policy removed_entities_backup_no_anon on public.removed_entities_backup for all to anon, authenticated using (false) with check (false);

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
      and not exists (select 1 from public.tombstones tb
                      where tb.entity_type = s.entity_type and tb.entity_id = s.entity_id
                        and tb.reason in ('ARCHIVED', 'REMOVED'))
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
      with l as (select s.entity_id, s.payload, s.operation from public.sync_records s
                 where s.entity_type = %1$L
                   and not exists (select 1 from public.tombstones tb
                                   where tb.entity_type = %1$L and tb.entity_id = s.entity_id
                                     and tb.reason in ('ARCHIVED', 'REMOVED'))),
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
    from public.sync_records s
    where entity_type in ('invoice', 'payment', 'expense', 'ledger')
      and not exists (select 1 from public.tombstones tb
                      where tb.entity_type = s.entity_type and tb.entity_id = s.entity_id
                        and tb.reason in ('ARCHIVED', 'REMOVED'))
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
                      where reason in (''ARCHIVED'', ''REMOVED'') and change_seq > $1 order by change_seq limit $2)';

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

    -- Rows deliberately removed by an admin (sync_remove_entities) are acknowledged but never
    -- written again; the device drops its copy on the next pull (PURGE / DELETE).
    if exists (select 1 from public.tombstones tb
               where tb.entity_type = v_type and tb.entity_id = v_id and tb.reason = 'REMOVED') then
      v_results := v_results || jsonb_build_object('mutation_id', v_mutation, 'entity_id', v_id,
        'server_id', 'srv-' || v_id, 'status', 'SYNCED', 'applied', 'REMOVED');
      continue;
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

-- p_items: [{"entity_type":"order_item","entity_id":"..."}, ...]
create or replace function public.sync_remove_entities(p_items jsonb, p_reason text default 'removed by admin')
returns jsonb
language plpgsql as $$
declare
  it jsonb;
  m public.sync_entity_map%rowtype;
  v_type text;
  v_id text;
  v_ts text := public.sync_iso(now());
  v_out jsonb := '[]'::jsonb;
  v_legacy integer;
  v_norm integer;
  v_quar integer;
begin
  perform public.sync_lock();
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_type := it ->> 'entity_type';
    v_id := it ->> 'entity_id';
    select * into m from public.sync_entity_map where entity_type = v_type;
    if not found then
      raise exception 'unknown entity_type %', v_type;
    end if;

    insert into public.removed_entities_backup (reason, entity_type, entity_id, operation, payload, device_id, updated_at, quarantine_reason)
    select p_reason, v_type, v_id, s.operation, s.payload, s.device_id, s.updated_at,
           (select q.reason from public.migration_quarantine q where q.entity_type = v_type and q.entity_id = v_id)
    from public.sync_records s where s.entity_type = v_type and s.entity_id = v_id;

    -- legacy: soft delete (devices on the legacy pull hide the row)
    update public.sync_records s
    set operation = 'DELETE', updated_at = now(),
        payload = s.payload || jsonb_build_object('deleted_at', v_ts, 'updated_at', v_ts,
                                                 'version', coalesce((s.payload ->> 'version')::int, 1) + 1)
    where s.entity_type = v_type and s.entity_id = v_id;
    get diagnostics v_legacy = row_count;

    delete from public.migration_quarantine where entity_type = v_type and entity_id = v_id;
    get diagnostics v_quar = row_count;

    -- normalized: soft delete if the row exists there (FK children keep their parent)
    execute format('update public.%I set deleted_at = coalesce(deleted_at, now()), updated_at = now(), version = version + 1 where id = $1', m.table_name)
      using v_id;
    get diagnostics v_norm = row_count;

    insert into public.tombstones (entity_type, entity_id, reason, deleted_at, change_seq)
    values (v_type, v_id, 'REMOVED', now(), nextval('public.sync_change_seq'))
    on conflict (entity_type, entity_id) do update
      set reason = 'REMOVED', deleted_at = excluded.deleted_at, change_seq = excluded.change_seq;

    v_out := v_out || jsonb_build_object('entity_type', v_type, 'entity_id', v_id,
      'legacy_rows', v_legacy, 'normalized_rows', v_norm, 'unquarantined', v_quar);
  end loop;
  return v_out;
end $$;

do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('sync_remove_entities', 'sync_backfill', 'sync_reconcile', 'sync_pull', 'sync_apply_batch')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
