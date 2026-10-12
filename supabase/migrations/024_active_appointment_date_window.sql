-- Allow a new appointment after the previous active appointment date has passed.
-- Run after migration 023_one_active_appointment.sql.

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

revoke all on function public.prevent_multiple_active_appointments() from public, anon;

commit;
