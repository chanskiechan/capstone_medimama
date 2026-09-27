-- Allow a mother to submit an infant registration for her own maternal record.
-- The health center still approves the infant before it becomes active.

drop policy if exists "infants: mothers register own" on public.infants;

create policy "infants: mothers register own"
on public.infants for insert to authenticated
with check (
  public.is_mother()
  and public.can_access_mother(mother_id)
  and status = 'pending_approval'
);
