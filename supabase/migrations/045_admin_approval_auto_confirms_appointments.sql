-- An administrator's approved reschedule is the final confirmation.
-- The mother should not need to confirm the same appointment a second time.
begin;

update public.appointments as appointment
set status = 'confirmed',
    mother_confirmed_at = coalesce(mother_confirmed_at, now())
where appointment.status = 'rescheduled'
  and exists (
    select 1
    from public.appointment_change_requests as request
    where request.appointment_id = appointment.id
      and request.status = 'approved'
  );

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
        status = 'confirmed',
        mother_confirmed_at = now()
    where id = target.id;
  end if;

  update public.appointment_change_requests
  set status = decision, reviewed_by = auth.uid(), reviewed_at = now()
  where id = request_row.id;
end;
$$;

grant execute on function public.review_appointment_reschedule(uuid, text) to authenticated;

commit;
