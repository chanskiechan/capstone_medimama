-- Send appointment reminders once during the 23-25 hour window before the appointment.
-- The scheduler/server checks this function repeatedly, so the unique source key
-- makes the one-day email idempotent for each recipient and appointment.
create or replace function public.generate_appointment_reminders()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications(user_id, source_key, message)
  select distinct recipients.user_id,
    'appointment-1day:' || a.id || ':' || a.scheduled_at,
    'Appointment tomorrow: ' || a.service || ' at ' || to_char(a.scheduled_at at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI') || ' (Philippine time). Status: ' || a.status
  from public.appointments a
  left join public.infants i on i.id = a.infant_id
  cross join lateral (
    select user_id from public.mother_accounts where mother_id = coalesce(a.mother_id, i.mother_id)
    union select caregiver_id from public.caregiver_assignments where mother_id = coalesce(a.mother_id, i.mother_id) and status = 'approved'
  ) recipients
  where a.scheduled_at > now() + interval '23 hours'
    and a.scheduled_at <= now() + interval '25 hours'
    and a.status in ('pending', 'rescheduled', 'confirmed')
  on conflict(user_id, source_key) do nothing;
$$;
