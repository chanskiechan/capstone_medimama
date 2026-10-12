-- A patient may have only one unfinished appointment whose date has not passed.
-- Run after migration 022_pending_appointment_workflow.sql.

begin;

create or replace function public.prevent_multiple_active_appointments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('pending', 'confirmed', 'rescheduled') and exists (
    select 1
    from public.appointments a
    where a.id <> new.id
      and a.status in ('pending', 'confirmed', 'rescheduled')
      and (a.scheduled_at at time zone 'Asia/Manila')::date >= (now() at time zone 'Asia/Manila')::date
      and (
        (new.mother_id is not null and a.mother_id = new.mother_id)
        or (new.infant_id is not null and a.infant_id = new.infant_id)
      )
  ) then
    raise exception 'Wait until the current appointment date has passed before booking another';
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_one_active on public.appointments;
create trigger appointments_one_active
before insert or update of mother_id, infant_id, status on public.appointments
for each row execute function public.prevent_multiple_active_appointments();

revoke all on function public.prevent_multiple_active_appointments() from public, anon;

commit;
