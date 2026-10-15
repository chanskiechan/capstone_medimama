-- Store the complete caregiver registration for administrator review.
-- Run after 025_mother_account_approval.sql and 018_caregiver_archive.sql.
begin;

alter table public.caregiver_requests add column if not exists middle_name text;
alter table public.caregiver_requests add column if not exists suffix text;
alter table public.caregiver_requests add column if not exists address text;
alter table public.caregiver_requests add column if not exists birth_date date;
alter table public.caregiver_requests add column if not exists email text;
alter table public.caregiver_requests add column if not exists emergency_contact text;
alter table public.caregiver_requests add column if not exists valid_id_path text;
alter table public.caregiver_requests add column if not exists valid_id_name text;

create index if not exists caregiver_requests_email_idx on public.caregiver_requests(email);

-- Valid IDs are private. The server uploads them with the service-role key and
-- administrators can read them through the dashboard's authenticated session.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('caregiver-ids', 'caregiver-ids', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "caregiver ids: admin read" on storage.objects;
create policy "caregiver ids: admin read" on storage.objects for select to authenticated
using (bucket_id = 'caregiver-ids' and public.is_admin());

-- Keep the existing mother approval behavior and add the complete caregiver
-- registration data to the caregiver request created by the auth trigger.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_mother_id uuid;
  requested_role text := coalesce(new.raw_user_meta_data ->> 'requested_role', 'mother');
begin
  if requested_role not in ('mother', 'caregiver') then requested_role := 'mother'; end if;

  insert into public.profiles (id, full_name, role, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    requested_role::public.user_role,
    nullif(new.raw_user_meta_data ->> 'contact_number', '')
  );

  if requested_role = 'mother' then
    insert into public.mothers (record_code, full_name, contact_number, address, status)
    values (
      'M-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'contact_number', ''),
      nullif(new.raw_user_meta_data ->> 'address', ''),
      'pending_approval'
    ) returning id into new_mother_id;
    insert into public.mother_accounts (mother_id, user_id) values (new_mother_id, new.id);
  else
    insert into public.caregiver_requests (
      caregiver_id, full_name, middle_name, suffix, address, birth_date,
      email, contact_number, emergency_contact, relationship,
      requested_patient_name
    ) values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'middle_name', ''),
      nullif(new.raw_user_meta_data ->> 'suffix', ''),
      nullif(new.raw_user_meta_data ->> 'address', ''),
      nullif(new.raw_user_meta_data ->> 'birthdate', '')::date,
      lower(coalesce(new.email, new.raw_user_meta_data ->> 'email', '')),
      nullif(new.raw_user_meta_data ->> 'contact_number', ''),
      nullif(new.raw_user_meta_data ->> 'emergency_contact', ''),
      coalesce(nullif(new.raw_user_meta_data ->> 'relationship', ''), 'Not specified'),
      coalesce(nullif(new.raw_user_meta_data ->> 'linked_patient', ''), 'Not specified')
    );
  end if;
  return new;
end; $$;

commit;
