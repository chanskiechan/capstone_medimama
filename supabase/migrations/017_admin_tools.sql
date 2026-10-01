-- Run once AFTER migration 016. Additive; preserves existing patient records.
begin;
create table public.audit_events (
  id uuid primary key default gen_random_uuid(), actor_id uuid,
  entity text not null, record_id uuid, action text not null,
  created_at timestamptz not null default now()
);
alter table public.audit_events enable row level security;
create policy "admin reads audit" on public.audit_events for select to authenticated using(public.is_admin());
grant select on public.audit_events to authenticated;
revoke insert, update, delete on public.audit_events from anon, authenticated;
create index audit_events_created_idx on public.audit_events(created_at desc);
create function public.record_care_audit() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.audit_events(actor_id,entity,record_id,action)
  values(auth.uid(),tg_table_name,case when tg_op='DELETE' then old.id else new.id end,tg_op);
  return null;
end; $$;
do $$ declare target text; begin
  foreach target in array array['mothers','infants','maternal_records','growth_records','vaccinations','infant_records','appointments','health_concerns','caregiver_assignments','announcements','profiles'] loop
    execute format('create trigger care_audit after insert or update or delete on public.%I for each row execute function public.record_care_audit()',target);
  end loop;
end; $$;

-- This is a clinical-record backup, not an export of authentication accounts.
create function public.export_clinical_backup() returns jsonb
language plpgsql stable security invoker set search_path=public as $$
declare target text; rows_json jsonb; tables_json jsonb := '{}';
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  foreach target in array array['mothers','infants','maternal_records','growth_records','vaccinations','infant_records','appointments','care_notes'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from public.%I t',target) into rows_json;
    tables_json := tables_json || jsonb_build_object(target,rows_json);
  end loop;
  return jsonb_build_object('format','medimama-clinical','version',1,'exported_at',now(),'tables',tables_json);
end; $$;

-- Restore missing IDs only. Existing records are never overwritten or deleted.
-- All inserts run in one transaction: invalid references roll the entire restore back.
create function public.restore_clinical_backup(backup_json jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare target text; affected integer; totals jsonb := '{}';
  allowed text[] := array['mothers','infants','maternal_records','growth_records','vaccinations','infant_records','appointments','care_notes'];
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if backup_json->>'format' is distinct from 'medimama-clinical' or backup_json->>'version' is distinct from '1' or jsonb_typeof(backup_json->'tables') is distinct from 'object' then raise exception 'Invalid backup format'; end if;
  if octet_length(backup_json::text)>26214400 then raise exception 'Backup exceeds 25 MB'; end if;
  if exists(select 1 from jsonb_object_keys(backup_json->'tables') as t(name) where not (name=any(allowed))) then raise exception 'Unexpected table in backup'; end if;
  foreach target in array allowed loop
    if jsonb_typeof(backup_json->'tables'->target) is distinct from 'array' then raise exception 'Missing or invalid table: %',target; end if;
    if exists(select 1 from jsonb_array_elements(backup_json->'tables'->target) r where jsonb_typeof(r) <> 'object' or nullif(r->>'id','') is null) then raise exception 'Invalid records in %',target; end if;
    execute format('insert into public.%1$I select * from jsonb_populate_recordset(null::public.%1$I,$1) on conflict (id) do nothing',target) using backup_json->'tables'->target;
    get diagnostics affected = row_count;
    totals := totals || jsonb_build_object(target,affected);
  end loop;
  return totals;
end; $$;
revoke all on function public.export_clinical_backup() from public,anon;
revoke all on function public.restore_clinical_backup(jsonb) from public,anon;
grant execute on function public.export_clinical_backup() to authenticated;
grant execute on function public.restore_clinical_backup(jsonb) to authenticated;
commit;
