-- Persist the mother birthdate captured by the registration form.
-- Run after 028_caregiver_registration_details.sql.
begin;

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
    insert into public.mothers (record_code, full_name, birth_date, contact_number, address, status)
    values (
      'M-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'birthdate', '')::date,
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
