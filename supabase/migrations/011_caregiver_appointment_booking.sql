-- Allow approved caregivers to request appointments only for their linked family.
-- Run once in the Supabase SQL Editor after migrations 001 through 010.

drop policy if exists "appointments: caregivers book linked" on public.appointments;

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

drop policy if exists "appointments: caregivers reschedule own linked" on public.appointments;

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
