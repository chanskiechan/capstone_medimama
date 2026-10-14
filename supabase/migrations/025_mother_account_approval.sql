-- Require administrator approval before a newly registered mother can log in.
-- The mother record is created immediately so the admin can review it, but it
-- stays pending_approval until the admin changes it to active.

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
    insert into public.mothers (record_code, full_name, contact_number, address, status)
    values ('M-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), coalesce(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'contact_number', ''), nullif(new.raw_user_meta_data ->> 'address', ''), 'pending_approval')
    returning id into new_mother_id;
    insert into public.mother_accounts (mother_id, user_id) values (new_mother_id, new.id);
  else
    insert into public.caregiver_requests (caregiver_id, full_name, contact_number, relationship, requested_patient_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'contact_number', ''), coalesce(nullif(new.raw_user_meta_data ->> 'relationship', ''), 'Not specified'), coalesce(nullif(new.raw_user_meta_data ->> 'linked_patient', ''), 'Not specified'));
  end if;
  return new;
end; $$;
