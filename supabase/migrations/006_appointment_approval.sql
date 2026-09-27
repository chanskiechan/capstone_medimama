-- Appointment review workflow. Run once in the Supabase SQL Editor after
-- migrations 001 through 005.
--
-- Remove the old policies first because they reference the status column.
drop policy if exists "appointments: mothers book linked" on public.appointments;
drop policy if exists "appointments: mothers reschedule linked" on public.appointments;

-- The original status column was an enum. It is converted to text here so
-- pending and approved can be introduced safely in one SQL Editor run.

alter table public.appointments alter column status drop default;
alter table public.appointments alter column status type text using status::text;
alter table public.appointments alter column status set default 'pending';
alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status in ('pending', 'scheduled', 'rescheduled', 'approved', 'completed', 'cancelled'));

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
