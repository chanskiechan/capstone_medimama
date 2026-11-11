begin;

-- Keep already-approved requests visible as rescheduled appointments while the
-- mother is still completing the new appointment confirmation step.
update public.appointments as appointment
set status = 'rescheduled',
    mother_confirmed_at = null
where appointment.status = 'pending'
  and exists (
    select 1
    from public.appointment_change_requests as request
    where request.appointment_id = appointment.id
      and request.status = 'approved'
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
    and status in ('pending', 'scheduled', 'approved', 'rescheduled');

  if not found then
    raise exception 'This appointment cannot be confirmed';
  end if;
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
        status = 'rescheduled',
        mother_confirmed_at = null
    where id = target.id;
  end if;

  update public.appointment_change_requests
  set status = decision, reviewed_by = auth.uid(), reviewed_at = now()
  where id = request_row.id;
end;
$$;

grant execute on function public.confirm_my_appointment(uuid) to authenticated;
grant execute on function public.review_appointment_reschedule(uuid, text) to authenticated;

commit;
