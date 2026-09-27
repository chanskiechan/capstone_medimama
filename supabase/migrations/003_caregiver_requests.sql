-- Caregiver registration and approval queue.
-- Run after 001_initial_schema.sql and 002_link_mother_signups.sql.

create table public.caregiver_requests (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null unique references public.profiles(id) on delete cascade,
  full_name text not null,
  contact_number text,
  relationship text not null,
  requested_patient_name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now()
);

create index caregiver_requests_status_idx on public.caregiver_requests(status, created_at desc);

alter table public.caregiver_requests enable row level security;
create policy "caregiver requests: user reads own" on public.caregiver_requests for select to authenticated using (caregiver_id = auth.uid() or public.is_admin());
create policy "caregiver requests: admin manages" on public.caregiver_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- A user can choose only mother or caregiver during public sign-up. Caregivers
-- get no patient access until an admin creates an approved caregiver_assignment.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_mother_id uuid;
  requested_role text := coalesce(new.raw_user_meta_data ->> 'requested_role', 'mother');
begin
  if requested_role not in ('mother', 'caregiver') then requested_role := 'mother'; end if;
  insert into public.profiles (id, full_name, role, phone)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), requested_role::public.user_role, nullif(new.raw_user_meta_data ->> 'contact_number', ''));

  if requested_role = 'mother' then
    insert into public.mothers (record_code, full_name, contact_number, address)
    values ('M-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), coalesce(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'contact_number', ''), nullif(new.raw_user_meta_data ->> 'address', ''))
    returning id into new_mother_id;
    insert into public.mother_accounts (mother_id, user_id) values (new_mother_id, new.id);
  else
    insert into public.caregiver_requests (caregiver_id, full_name, contact_number, relationship, requested_patient_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'contact_number', ''), coalesce(nullif(new.raw_user_meta_data ->> 'relationship', ''), 'Not specified'), coalesce(nullif(new.raw_user_meta_data ->> 'linked_patient', ''), 'Not specified'));
  end if;
  return new;
end; $$;
