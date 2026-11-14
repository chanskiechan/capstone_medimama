-- Preserve the human-readable recorder selected by the health center when
-- the registration measurement is created with a new infant.
begin;

create or replace function public.register_care_infant(values_json jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  target_mother uuid := (values_json->>'motherId')::uuid;
  recorder_label text := case
    when values_json->>'recordedBy' in ('Irene S. Andres', 'Health Center') then values_json->>'recordedBy'
    else null
  end;
begin
  if auth.uid() is null or not (public.is_admin() or exists (
    select 1 from public.mother_accounts a join public.mothers m on m.id = a.mother_id
    where a.user_id = auth.uid() and a.mother_id = target_mother and m.maternal_status = 'postnatal' and m.status <> 'archived'
  )) then raise exception 'Only an administrator or the linked postnatal mother can register this infant'; end if;
  if (values_json->>'measuredDate')::date < (values_json->>'birthDate')::date then raise exception 'Measurement date cannot precede birth'; end if;
  insert into public.infants(record_code, mother_id, full_name, birth_date, sex, place_of_birth, birth_weight_kg, birth_length_cm, guardian_name, guardian_contact, address, blood_type, allergies, medical_notes, status)
  values('I-' || upper(substr(gen_random_uuid()::text,1,8)), target_mother, values_json->>'name', (values_json->>'birthDate')::date, lower(values_json->>'sex'), values_json->>'placeOfBirth', nullif(values_json->>'birthWeight','')::numeric, nullif(values_json->>'birthLength','')::numeric, values_json->>'fatherName', values_json->>'guardianContact', values_json->>'address', values_json->>'bloodType', values_json->>'allergies', values_json->>'medicalNotes', case when public.is_admin() then 'active'::public.patient_status else 'pending_approval'::public.patient_status end)
  returning id into new_id;
  insert into public.growth_records(infant_id, measured_at, weight_kg, length_cm, muac_cm, notes, recorded_by, recorded_by_label)
  values(new_id, (values_json->>'measuredDate')::date, (values_json->>'weight')::numeric, (values_json->>'length')::numeric, nullif(values_json->>'muac','')::numeric, case when public.is_admin() then 'Registration measurement: health center' else 'Registration measurement: mother reported, awaiting review' end, auth.uid(), recorder_label);
  return new_id;
end; $$;

revoke all on function public.register_care_infant(jsonb) from public, anon;
grant execute on function public.register_care_infant(jsonb) to authenticated;

commit;
