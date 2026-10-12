-- Make the admin-created appointment workflow explicit:
-- pending -> confirmed or rescheduled (selected by the mother).
-- This migration is safe to run after 021, including on databases where 021
-- was already applied before the status workflow was corrected.

begin;

alter table public.appointments
  add column if not exists mother_confirmed_at timestamptz;

-- These RLS policies compare appointments.status. PostgreSQL requires them
-- to be removed before changing the status column type, then recreated below.
drop policy if exists "appointments: mothers book linked" on public.appointments;
drop policy if exists "appointments: mothers reschedule linked" on public.appointments;
drop policy if exists "appointments: caregivers book linked" on public.appointments;
drop policy if exists "appointments: caregivers reschedule own linked" on public.appointments;

-- The original schema used an enum that did not include the mother-response
-- states. Use text so pending/confirmed/rescheduled are stored consistently.
alter table public.appointments
  alter column status drop default;

alter table public.appointments
  alter column status type text using status::text;

alter table public.appointments
  drop constraint if exists appointments_status_check;

-- Normalize legacy values created by older versions of the application.
update public.appointments
set status = 'pending'
where status in ('scheduled', 'approved');

update public.appointments
set mother_confirmed_at = null
where status in ('pending', 'rescheduled');

alter table public.appointments
  alter column status set default 'pending';

alter table public.appointments
  add constraint appointments_status_check
  check (status in ('pending', 'rescheduled', 'confirmed', 'completed', 'cancelled'));

create policy "appointments: mothers book linked"
on public.appointments for insert to authenticated
with check (
  public.is_mother()
  and created_by = auth.uid()
  and status = 'pending'
  and (
    (mother_id is not null and public.can_access_mother(mother_id))
    or (infant_id is not null and public.can_access_infant(infant_id))
  )
);

create policy "appointments: mothers reschedule linked"
on public.appointments for update to authenticated
using (
  public.is_mother()
  and created_by = auth.uid()
  and (
    (mother_id is not null and public.can_access_mother(mother_id))
    or (infant_id is not null and public.can_access_infant(infant_id))
  )
)
with check (
  public.is_mother()
  and created_by = auth.uid()
  and status = 'pending'
  and (
    (mother_id is not null and public.can_access_mother(mother_id))
    or (infant_id is not null and public.can_access_infant(infant_id))
  )
);

create policy "appointments: caregivers book linked"
on public.appointments for insert to authenticated
with check (
  public.is_caregiver()
  and created_by = auth.uid()
  and status = 'pending'
  and (
    (mother_id is not null and public.can_access_mother(mother_id))
    or (infant_id is not null and public.can_access_infant(infant_id))
  )
);

create policy "appointments: caregivers reschedule own linked"
on public.appointments for update to authenticated
using (
  public.is_caregiver()
  and created_by = auth.uid()
  and (
    (mother_id is not null and public.can_access_mother(mother_id))
    or (infant_id is not null and public.can_access_infant(infant_id))
  )
)
with check (
  public.is_caregiver()
  and created_by = auth.uid()
  and status = 'pending'
  and (
    (mother_id is not null and public.can_access_mother(mother_id))
    or (infant_id is not null and public.can_access_infant(infant_id))
  )
);

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
    -- Keep older appointments usable if this function is installed before
    -- the legacy-status normalization has finished.
    and status in ('pending', 'scheduled', 'approved');

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
  if target.status not in ('pending', 'scheduled', 'approved') then
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
      and a.status <> 'cancelled'
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
    and a.status <> 'cancelled'
    and (a.scheduled_at at time zone 'Asia/Manila')::date = local_date
    and (case when a.service ~* '(immunization|infant|newborn)' then 'infant' else 'maternal' end) = group_name;
  if group_count >= 20 then
    raise exception 'This clinic group is full for the selected date';
  end if;

  select count(*) into slot_count
  from public.appointments a
  where a.id <> target.id
    and a.status <> 'cancelled'
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

-- Include appointments that are waiting for the mother's response in reminders.
create or replace function public.generate_appointment_reminders()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications(user_id, source_key, message)
  select distinct recipients.user_id, 'appointment:' || a.id || ':' || a.scheduled_at,
    'Upcoming ' || a.service || ': ' || to_char(a.scheduled_at at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI') || ' (Philippine time). Status: ' || a.status
  from public.appointments a
  left join public.infants i on i.id = a.infant_id
  cross join lateral (
    select user_id from public.mother_accounts where mother_id = coalesce(a.mother_id, i.mother_id)
    union select caregiver_id from public.caregiver_assignments where mother_id = coalesce(a.mother_id, i.mother_id) and status = 'approved'
  ) recipients
  where a.scheduled_at between now() and now() + interval '3 days'
    and a.status in ('pending', 'rescheduled', 'confirmed')
  on conflict(user_id, source_key) do nothing;
$$;

revoke all on function public.confirm_my_appointment(uuid) from public, anon;
revoke all on function public.reschedule_my_appointment(uuid, text) from public, anon;
grant execute on function public.confirm_my_appointment(uuid) to authenticated;
grant execute on function public.reschedule_my_appointment(uuid, text) to authenticated;

commit;
