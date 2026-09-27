-- Allow a signed-in Mother to book or reschedule only appointments linked
-- to her own maternal/infant records. Run once in Supabase SQL Editor.

create or replace function public.is_mother()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'mother');
$$;

create policy "appointments: mothers book linked"
on public.appointments for insert to authenticated
with check (
  public.is_mother()
  and created_by = auth.uid()
  and status in ('scheduled', 'rescheduled')
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
  and status in ('scheduled', 'rescheduled')
  and (
    (mother_id is not null and public.can_access_mother(mother_id))
    or (infant_id is not null and public.can_access_infant(infant_id))
  )
);
