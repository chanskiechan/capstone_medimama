-- Fix maternal appointment slot generation.
-- PostgreSQL does not provide generate_series(time, time, interval),
-- so generate timestamp values and cast each slot back to time.

begin;

create or replace function public.schedule_first_maternal_appointment(target_mother_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  mother_row public.mothers%rowtype;
  existing_id uuid;
  clinic_date date;
  local_today date := (now() at time zone 'Asia/Manila')::date;
  clinic_time time;
  maternal_count integer;
  slot_count integer;
  week_offset integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  select * into mother_row
  from public.mothers
  where id = target_mother_id;

  if mother_row.id is null then
    raise exception 'Mother record not found';
  end if;

  if mother_row.status <> 'active' then
    raise exception 'Approve the mother record before scheduling an appointment';
  end if;

  select a.id into existing_id
  from public.appointments a
  where a.mother_id = target_mother_id
    and a.status in ('pending', 'confirmed', 'rescheduled')
  order by a.scheduled_at desc
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  -- Search a full year of Wednesdays. Each maternal Wednesday has 30 places,
  -- with no more than three mothers in the same 30-minute slot.
  for week_offset in 0..52 loop
    clinic_date := local_today
      + ((3 - extract(dow from local_today)::integer + 7) % 7)
      + (week_offset * 7);

    if clinic_date <= local_today then
      clinic_date := clinic_date + 7;
    end if;

    select count(*) into maternal_count
    from public.appointments a
    where a.status <> 'cancelled'
      and a.mother_id is not null
      and (a.scheduled_at at time zone 'Asia/Manila')::date = clinic_date;

    if maternal_count >= 30 then
      continue;
    end if;

    for clinic_time in
      select slot::time
      from generate_series(
        timestamp '2000-01-01 10:00:00',
        timestamp '2000-01-01 16:30:00',
        interval '30 minutes'
      ) as slots(slot)
    loop
      select count(*) into slot_count
      from public.appointments a
      where a.status <> 'cancelled'
        and a.mother_id is not null
        and (a.scheduled_at at time zone 'Asia/Manila')::date = clinic_date
        and (a.scheduled_at at time zone 'Asia/Manila')::time = clinic_time;

      if slot_count < 3 then
        insert into public.appointments (mother_id, service, reason, scheduled_at, status, created_by)
        values (
          target_mother_id,
          'Prenatal Checkup',
          'Initial appointment after mother registration',
          (clinic_date + clinic_time) at time zone 'Asia/Manila',
          'pending',
          auth.uid()
        )
        returning id into existing_id;
        return existing_id;
      end if;
    end loop;
  end loop;

  raise exception 'No maternal Wednesday appointment slot is available in the next year';
end;
$$;

revoke all on function public.schedule_first_maternal_appointment(uuid) from public, anon;
grant execute on function public.schedule_first_maternal_appointment(uuid) to authenticated;

commit;
