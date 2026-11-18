-- A reschedule must move an appointment to a later Wednesday, never back to
-- an earlier date that is already before the current appointment.
begin;

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
  current_date_manila date;
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

  current_date_manila := (target.scheduled_at at time zone 'Asia/Manila')::date;
  if requested_date <= (now() at time zone 'Asia/Manila')::date then
    raise exception 'Choose a future Wednesday';
  end if;
  if requested_date <= current_date_manila then
    raise exception 'Choose a Wednesday after the current appointment date';
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

revoke all on function public.request_appointment_reschedule(uuid, date, text, text) from public, anon;
grant execute on function public.request_appointment_reschedule(uuid, date, text, text) to authenticated;

commit;
