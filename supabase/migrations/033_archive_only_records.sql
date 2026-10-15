-- Keep application records for history and audit purposes.
-- Users and administrators must archive records instead of deleting them.

begin;

create or replace function public.prevent_record_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Records cannot be deleted. Archive the record instead.';
end;
$$;

-- Archived patients must also disappear from caregiver/mother access queries.
create or replace function public.can_access_mother(target_mother_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.mothers m
      join public.mother_accounts ma on ma.mother_id = m.id
      where m.id = target_mother_id
        and m.status <> 'archived'
        and ma.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.mothers m
      join public.caregiver_assignments ca on ca.mother_id = m.id
      where m.id = target_mother_id
        and m.status <> 'archived'
        and ca.caregiver_id = auth.uid()
        and ca.status = 'approved'
    );
$$;

create or replace function public.can_access_infant(target_infant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.infants i
    where i.id = target_infant_id
      and i.status <> 'archived'
      and public.can_access_mother(i.mother_id)
  );
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'mothers',
    'mother_accounts',
    'infants',
    'caregiver_requests',
    'caregiver_assignments',
    'appointments',
    'care_tasks',
    'maternal_records',
    'infant_records',
    'growth_records',
    'vaccinations',
    'announcements'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'prevent_' || table_name || '_delete', table_name);
    execute format('create trigger %I before delete on public.%I for each row execute function public.prevent_record_delete()', 'prevent_' || table_name || '_delete', table_name);
  end loop;
end;
$$;

commit;
