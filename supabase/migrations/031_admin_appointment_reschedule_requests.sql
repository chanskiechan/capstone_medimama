-- Appointment capacity and rescheduling workflow.
-- Admins create appointments. Mothers may request another Wednesday, but the
-- appointment is changed only after an admin approves the request.

begin;

create table if not exists public.appointment_change_requests (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  requested_scheduled_at timestamptz not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists appointment_change_requests_appointment_idx
  on public.appointment_change_requests(appointment_id, status);

create unique index if not exists appointment_change_requests_one_pending
  on public.appointment_change_requests(appointment_id)
  where status = 'pending';

alter table public.appointment_change_requests enable row level security;

drop policy if exists "appointment change requests: read linked" on public.appointment_change_requests;
drop policy if exists "appointment change requests: admin manages" on public.appointment_change_requests;

create policy "appointment change requests: read linked"
on public.appointment_change_requests for select to authenticated
using (
  public.is_admin()
  or requested_by = auth.uid()
  or exists (
    select 1
    from public.appointments a
    where a.id = appointment_id
      and (
        (a.mother_id is not null and public.can_access_mother(a.mother_id))
        or (a.infant_id is not null and public.can_access_infant(a.infant_id))
      )
  )
);

create policy "appointment change requests: admin manages"
on public.appointment_change_requests for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Enforce the Wednesday clinic schedule and capacity for every admin write,
-- including writes made outside this frontend.
create or replace function public.enforce_appointment_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  local_date date;
  local_time time;
  group_name text;
  group_count integer;
  slot_count integer;
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  local_date := (new.scheduled_at at time zone 'Asia/Manila')::date;
  local_time := (new.scheduled_at at time zone 'Asia/Manila')::time;
  group_name := case when new.service ~* '(immunization|infant|newborn)' then 'infant' else 'maternal' end;
  -- Serialize capacity checks for the same clinic date and patient group so
  -- simultaneous admin bookings cannot both pass the count at once.
  perform pg_advisory_xact_lock(hashtextextended(local_date::text || ':' || group_name, 0));

  if extract(dow from local_date) <> 3 then
    raise exception 'Clinic appointments are available on Wednesdays only';
  end if;
  if local_time < (case when group_name = 'infant' then time '08:00' else time '10:00' end)
     or local_time > time '16:30'
     or extract(minute from local_time)::integer not in (0, 30)
  then
    raise exception 'Choose a 30-minute slot within clinic hours';
  end if;

  select count(*) into group_count
  from public.appointments a
  where a.id <> new.id
    and a.status <> 'cancelled'
    and (a.scheduled_at at time zone 'Asia/Manila')::date = local_date
    and (case when a.service ~* '(immunization|infant|newborn)' then 'infant' else 'maternal' end) = group_name;
  if group_count >= 30 then
    raise exception 'This Wednesday is full for % appointments. The limit is 30.', group_name;
  end if;

  select count(*) into slot_count
  from public.appointments a
  where a.id <> new.id
    and a.status <> 'cancelled'
    and (a.scheduled_at at time zone 'Asia/Manila')::date = local_date
    and (a.scheduled_at at time zone 'Asia/Manila')::time = local_time
    and (case when a.service ~* '(immunization|infant|newborn)' then 'infant' else 'maternal' end) = group_name;
  if slot_count >= 3 then
    raise exception 'This time slot is full';
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_capacity_guard on public.appointments;
create trigger appointments_capacity_guard
before insert or update of scheduled_at, service, status on public.appointments
for each row execute function public.enforce_appointment_capacity();

-- Remove the old direct mother/caregiver booking and reschedule paths. The
-- confirmation function remains available for mother confirmation.
drop policy if exists "appointments: mothers book linked" on public.appointments;
drop policy if exists "appointments: mothers reschedule linked" on public.appointments;
drop policy if exists "appointments: caregivers book linked" on public.appointments;
drop policy if exists "appointments: caregivers reschedule own linked" on public.appointments;
drop function if exists public.reschedule_my_appointment(uuid, text);

create or replace function public.request_appointment_reschedule(
  target_appointment_id uuid,
  requested_date date,
  requested_time_text text,
  reason_text text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.appointments%rowtype;
  requested_time time;
  group_name text;
  group_count integer;
  slot_count integer;
  request_id uuid;
begin
  if not public.is_mother() then
    raise exception 'Mother access required';
  end if;
  if coalesce(trim(reason_text), '') = '' then
    raise exception 'Explain why the appointment needs to be moved';
  end if;

  select a.* into target
  from public.appointments a
  where a.id = target_appointment_id
    and (
      (a.mother_id is not null and exists (select 1 from public.mother_accounts ma where ma.user_id = auth.uid() and ma.mother_id = a.mother_id))
      or (a.infant_id is not null and exists (
        select 1 from public.infants i
        join public.mother_accounts ma on ma.mother_id = i.mother_id
        where ma.user_id = auth.uid() and i.id = a.infant_id
      ))
    );
  if target.id is null then
    raise exception 'Appointment not found or not linked to your account';
  end if;
  if target.status not in ('pending', 'confirmed', 'rescheduled') then
    raise exception 'This appointment cannot be moved';
  end if;
  if requested_date <= (now() at time zone 'Asia/Manila')::date then
    raise exception 'Choose a future Wednesday';
  end if;
  if extract(dow from requested_date) <> 3 then
    raise exception 'Choose a Wednesday';
  end if;

  begin
    requested_time := requested_time_text::time;
  exception when others then
    raise exception 'Choose a valid appointment time';
  end;

  group_name := case when target.service ~* '(immunization|infant|newborn)' then 'infant' else 'maternal' end;
  if requested_time < (case when group_name = 'infant' then time '08:00' else time '10:00' end)
     or requested_time > time '16:30'
     or extract(minute from requested_time)::integer not in (0, 30)
  then
    raise exception 'Choose a 30-minute slot within clinic hours';
  end if;
  if (target.scheduled_at at time zone 'Asia/Manila')::date = requested_date then
    raise exception 'Choose another Wednesday';
  end if;
  if exists (select 1 from public.appointment_change_requests where appointment_id = target.id and status = 'pending') then
    raise exception 'A reschedule request is already waiting for admin review';
  end if;

  select count(*) into group_count
  from public.appointments a
  where a.status <> 'cancelled'
    and (a.scheduled_at at time zone 'Asia/Manila')::date = requested_date
    and (case when a.service ~* '(immunization|infant|newborn)' then 'infant' else 'maternal' end) = group_name;
  if group_count >= 30 then
    raise exception 'This Wednesday is full for % appointments. Choose another Wednesday.', group_name;
  end if;

  select count(*) into slot_count
  from public.appointments a
  where a.status <> 'cancelled'
    and (a.scheduled_at at time zone 'Asia/Manila')::date = requested_date
    and (a.scheduled_at at time zone 'Asia/Manila')::time = requested_time
    and (case when a.service ~* '(immunization|infant|newborn)' then 'infant' else 'maternal' end) = group_name;
  if slot_count >= 3 then
    raise exception 'This time slot is full';
  end if;

  insert into public.appointment_change_requests(appointment_id, requested_by, requested_scheduled_at, reason)
  values (target.id, auth.uid(), (requested_date + requested_time) at time zone 'Asia/Manila', trim(reason_text))
  returning id into request_id;
  return request_id;
end;
$$;

create or replace function public.review_appointment_reschedule(
  request_id uuid,
  decision text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.appointment_change_requests%rowtype;
  target public.appointments%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if decision not in ('approved', 'declined') then
    raise exception 'Choose approved or declined';
  end if;

  select * into request_row
  from public.appointment_change_requests
  where id = request_id and status = 'pending'
  for update;
  if request_row.id is null then
    raise exception 'Reschedule request not found or already reviewed';
  end if;

  if decision = 'approved' then
    select * into target from public.appointments where id = request_row.appointment_id for update;
    if target.id is null or target.status in ('completed', 'cancelled') then
      raise exception 'The original appointment is no longer available';
    end if;
    update public.appointments
    set scheduled_at = request_row.requested_scheduled_at,
        status = 'pending',
        mother_confirmed_at = null
    where id = target.id;
  end if;

  update public.appointment_change_requests
  set status = decision, reviewed_by = auth.uid(), reviewed_at = now()
  where id = request_row.id;
end;
$$;

revoke all on function public.request_appointment_reschedule(uuid, date, text, text) from public, anon;
revoke all on function public.review_appointment_reschedule(uuid, text) from public, anon;
grant execute on function public.request_appointment_reschedule(uuid, date, text, text) to authenticated;
grant execute on function public.review_appointment_reschedule(uuid, text) to authenticated;

commit;
