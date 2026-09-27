-- Secure infant registration for a signed-in mother. The mother_id is resolved
-- from the authenticated account, rather than trusted from the browser form.

create or replace function public.register_my_infant(
  new_full_name text,
  new_birth_date date,
  new_sex text,
  new_place_of_birth text default null,
  new_birth_weight_kg numeric default null,
  new_birth_length_cm numeric default null,
  new_blood_type text default null,
  new_guardian_name text default null,
  new_guardian_contact text default null,
  new_allergies text default null,
  new_medical_notes text default null
)
returns public.infants
language plpgsql security definer set search_path = public as $$
declare
  linked_mother_id uuid;
  saved_infant public.infants;
begin
  if not public.is_mother() then
    raise exception 'Only mother accounts can register an infant';
  end if;

  select mother_id into linked_mother_id
  from public.mother_accounts
  where user_id = auth.uid();

  if linked_mother_id is null then
    raise exception 'No mother record is linked to this account';
  end if;

  insert into public.infants (
    record_code, mother_id, full_name, birth_date, sex, place_of_birth,
    birth_weight_kg, birth_length_cm, blood_type, guardian_name,
    guardian_contact, allergies, medical_notes, status
  ) values (
    'I-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    linked_mother_id, new_full_name, new_birth_date, lower(new_sex), new_place_of_birth,
    new_birth_weight_kg, new_birth_length_cm, new_blood_type, new_guardian_name,
    new_guardian_contact, new_allergies, new_medical_notes, 'pending_approval'
  ) returning * into saved_infant;

  return saved_infant;
end; $$;
