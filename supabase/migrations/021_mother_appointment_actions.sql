-- Allow a linked Mother to confirm an appointment created by the health center
-- or request a different time on the same date. Run after migration 020.

begin;

alter table public.appointments
  add column if not exists mother_confirmed_at timestamptz;

alter table public.appointments
  drop constraint if exists appointments_status_check;

alter table public.appointments
  add constraint appointments_status_check
  check (status in ('pending', 'scheduled', 'rescheduled', 'approved', 'confirmed', 'completed', 'cancelled'));

create or replace function public.confirm_my_appointment(target_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  if not public.is_mother() then
    raise exception 'Mother access required';
  end if;

  select a.id into target_id
  from public.appointments a
  where a.id = target_appointment_id
    and (
      exists (
        select 1 from public.mother_accounts ma
        where ma.user_id = auth.uid() and ma.mother_id = a.mother_id
      )
      or exists (
        select 1
        from public.infants i
        join public.mother_accounts ma on ma.mother_id = i.mother_id
        where ma.user_id = auth.uid() and i.id = a.infant_id
      )
    );

  if target_id is null then
    raise exception 'Appointment not found or not linked to your account';
  end if;

  update public.appointments
  set status = 'confirmed',
      mother_confirmed_at = now()
  where id = target_id
    and status::text in ('approved', 'scheduled', 'rescheduled');

  if not found then
    raise exception 'This appointment cannot be confirmed';
  end if;
end;
$$;

create or replace function public.reschedule_my_appointment(
  target_appointment_id uuid,
  new_time_text text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.appointments%rowtype;
  requested_time time;
  opening_time time;
  local_date date;
  group_name text;
  group_count integer;
  slot_count integer;
begin
  if not public.is_mother() then
    raise exception 'Mother access required';
  end if;

  select a.* into target
  from public.appointments a
  where a.id = target_appointment_id
    and (
      exists (
        select 1 from public.mother_accounts ma
        where ma.user_id = auth.uid() and ma.mother_id = a.mother_id
      )
      or exists (
        select 1
        from public.infants i
        join public.mother_accounts ma on ma.mother_id = i.mother_id
        where ma.user_id = auth.uid() and i.id = a.infant_id
      )
    );

  if target.id is null then
    raise exception 'Appointment not found or not linked to your account';
  end if;
  if target.status::text not in ('approved', 'scheduled', 'rescheduled', 'confirmed') then
    raise exception 'This appointment cannot be rescheduled';
  end if;

  begin
    requested_time := new_time_text::time;
  exception when others then
    raise exception 'Choose a valid appointment time';
  end;

  local_date := (target.scheduled_at at time zone 'Asia/Manila')::date;
  group_name := case when target.service ~* '(immunization|infant|newborn)' then 'infant' else 'maternal' end;
  opening_time := case when group_name = 'infant' then time '08:00' else time '10:00' end;

  if requested_time < opening_time
     or requested_time > time '16:30'
     or extract(minute from requested_time)::integer not in (0, 30)
  then
    raise exception 'Choose a 30-minute slot within clinic hours';
  end if;
  if local_date < (now() at time zone 'Asia/Manila')::date then
    raise exception 'This appointment date has already passed';
  end if;
  if local_date = (now() at time zone 'Asia/Manila')::date
     and requested_time <= (now() at time zone 'Asia/Manila')::time
  then
    raise exception 'Choose a future time';
  end if;

  if exists (
    select 1 from public.appointments a
    where a.id <> target.id
      and a.status::text <> 'cancelled'
      and (a.scheduled_at at time zone 'Asia/Manila')::date = local_date
      and (a.scheduled_at at time zone 'Asia/Manila')::time = requested_time
      and (
        (target.mother_id is not null and a.mother_id = target.mother_id)
        or (target.infant_id is not null and a.infant_id = target.infant_id)
      )
  ) then
    raise exception 'This patient already has an appointment at that time';
  end if;

  select count(*) into group_count
  from public.appointments a
  where a.id <> target.id
    and a.status::text <> 'cancelled'
    and (a.scheduled_at at time zone 'Asia/Manila')::date = local_date
    and (case when a.service ~* '(immunization|infant|newborn)' then 'infant' else 'maternal' end) = group_name;
  if group_count >= 20 then
    raise exception 'This clinic group is full for the selected date';
  end if;

  select count(*) into slot_count
  from public.appointments a
  where a.id <> target.id
    and a.status::text <> 'cancelled'
    and (a.scheduled_at at time zone 'Asia/Manila')::date = local_date
    and (a.scheduled_at at time zone 'Asia/Manila')::time = requested_time
    and (case when a.service ~* '(immunization|infant|newborn)' then 'infant' else 'maternal' end) = group_name;
  if slot_count >= 2 then
    raise exception 'This time slot is full';
  end if;

  update public.appointments
  set scheduled_at = (local_date + requested_time) at time zone 'Asia/Manila',
      status = 'rescheduled',
      mother_confirmed_at = null
  where id = target.id;
end;
$$;

revoke all on function public.confirm_my_appointment(uuid) from public, anon;
revoke all on function public.reschedule_my_appointment(uuid, text) from public, anon;
grant execute on function public.confirm_my_appointment(uuid) to authenticated;
grant execute on function public.reschedule_my_appointment(uuid, text) to authenticated;

commit;
