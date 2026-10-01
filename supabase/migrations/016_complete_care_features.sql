-- Additive update for the exported September 2026 schema. Run once in SQL Editor.
begin;
alter table public.mothers add column if not exists care_plan jsonb not null default '{}';
alter table public.vaccinations add column if not exists batch text;
alter table public.mothers add column if not exists archive_previous_status public.patient_status;
alter table public.infants add column if not exists archive_previous_status public.patient_status;
alter table public.infants add column if not exists address text;
create or replace function public.register_care_infant(values_json jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid; target_mother uuid := (values_json->>'motherId')::uuid;
begin
  if auth.uid() is null or not (public.is_admin() or exists (
    select 1 from public.mother_accounts a join public.mothers m on m.id = a.mother_id
    where a.user_id = auth.uid() and a.mother_id = target_mother and m.maternal_status = 'postnatal' and m.status <> 'archived'
  )) then raise exception 'Only an administrator or the linked postnatal mother can register this infant'; end if;
  if (values_json->>'measuredDate')::date < (values_json->>'birthDate')::date then raise exception 'Measurement date cannot precede birth'; end if;
  insert into public.infants(record_code, mother_id, full_name, birth_date, sex, place_of_birth, birth_weight_kg, birth_length_cm, guardian_name, guardian_contact, address, blood_type, allergies, medical_notes, status)
  values('I-' || upper(substr(gen_random_uuid()::text,1,8)), target_mother, values_json->>'name', (values_json->>'birthDate')::date, lower(values_json->>'sex'), values_json->>'placeOfBirth', nullif(values_json->>'birthWeight','')::numeric, nullif(values_json->>'birthLength','')::numeric, values_json->>'fatherName', values_json->>'guardianContact', values_json->>'address', values_json->>'bloodType', values_json->>'allergies', values_json->>'medicalNotes', case when public.is_admin() then 'active'::public.patient_status else 'pending_approval'::public.patient_status end)
  returning id into new_id;
  insert into public.growth_records(infant_id, measured_at, weight_kg, length_cm, muac_cm, notes, recorded_by)
  values(new_id, (values_json->>'measuredDate')::date, (values_json->>'weight')::numeric, (values_json->>'length')::numeric, nullif(values_json->>'muac','')::numeric, case when public.is_admin() then 'Registration measurement: health center' else 'Registration measurement: mother reported, awaiting review' end, auth.uid());
  return new_id;
end; $$;
revoke all on function public.register_care_infant(jsonb) from public, anon;
grant execute on function public.register_care_infant(jsonb) to authenticated;
create or replace function public.track_archive_status()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'archived' and old.status <> 'archived' then new.archive_previous_status := old.status; end if;
  if new.status <> 'archived' and old.status = 'archived' then new.status := coalesce(old.archive_previous_status, 'active'); end if;
  return new;
end; $$;
create trigger mother_archive_status before update on public.mothers for each row execute function public.track_archive_status();
create trigger infant_archive_status before update on public.infants for each row execute function public.track_archive_status();
create table public.infant_records (
  id uuid primary key default gen_random_uuid(),
  infant_id uuid not null references public.infants(id) on delete cascade,
  record_date date not null check(record_date <= current_date),
  record_type text not null,
  details text,
  notes text,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.infant_records enable row level security;
create policy "infant records read linked" on public.infant_records for select to authenticated using(public.can_access_infant(infant_id));
create policy "infant records admin write" on public.infant_records for all to authenticated using(public.is_admin()) with check(public.is_admin());

create table public.health_concerns (
  id uuid primary key default gen_random_uuid(),
  mother_id uuid references public.mothers(id),
  infant_id uuid references public.infants(id),
  author_id uuid not null default auth.uid() references public.profiles(id),
  category text not null check(category in ('Maternal health', 'Infant health', 'Post-vaccination')),
  description text not null check(char_length(trim(description)) between 1 and 3000),
  status text not null default 'Open' check(status in ('Open', 'Under review', 'Resolved')),
  response text not null default '',
  reviewed_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check((mother_id is null) <> (infant_id is null))
);
alter table public.health_concerns enable row level security;
create policy "concerns read linked" on public.health_concerns for select to authenticated using(public.is_admin() or (author_id = auth.uid() and (public.can_access_mother(mother_id) or public.can_access_infant(infant_id))));
create policy "concerns submit" on public.health_concerns for insert to authenticated with check(author_id = auth.uid() and status = 'Open' and response = '' and reviewed_by is null and (public.can_access_mother(mother_id) or public.can_access_infant(infant_id)));
create policy "concerns review" on public.health_concerns for update to authenticated using(public.is_admin()) with check(public.is_admin());
grant select, insert, update, delete on public.infant_records to authenticated;
grant select, insert, update on public.health_concerns to authenticated;
create trigger health_concerns_updated before update on public.health_concerns for each row execute function public.set_updated_at();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_key text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, source_key)
);
alter table public.notifications enable row level security;
create policy "notifications read own" on public.notifications for select to authenticated using(user_id = auth.uid());
create policy "notifications mark own" on public.notifications for update to authenticated using(user_id = auth.uid()) with check(user_id = auth.uid());
grant select on public.notifications to authenticated;
revoke update on public.notifications from authenticated;
grant update(read_at) on public.notifications to authenticated;

-- Appointment reminders are generated on the server, including while the app is closed.
create or replace function public.generate_appointment_reminders()
returns void language sql security definer set search_path = public as $$
  insert into public.notifications(user_id, source_key, message)
  select distinct recipients.user_id, 'appointment:' || a.id || ':' || a.scheduled_at,
    'Upcoming ' || a.service || ': ' || to_char(a.scheduled_at at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI') || ' (Philippine time). Status: ' || a.status
  from public.appointments a
  left join public.infants i on i.id = a.infant_id
  cross join lateral (
    select user_id from public.mother_accounts where mother_id = coalesce(a.mother_id, i.mother_id)
    union select caregiver_id from public.caregiver_assignments where mother_id = coalesce(a.mother_id, i.mother_id) and status = 'approved'
  ) recipients
  where a.scheduled_at between now() and now() + interval '3 days' and a.status::text in ('approved', 'scheduled', 'rescheduled')
  on conflict(user_id, source_key) do nothing;
$$;
revoke all on function public.generate_appointment_reminders() from public, anon, authenticated;

create or replace function public.notify_care_events()
returns trigger language plpgsql security definer set search_path = public as $$
declare recipient record; target_mother uuid;
begin
  if tg_table_name = 'health_concerns' then
    if tg_op = 'INSERT' then
      insert into public.notifications(user_id, source_key, message)
      select id, 'concern:' || new.id, 'A new ' || lower(new.category) || ' concern needs review.' from public.profiles where role = 'admin'
      on conflict do nothing;
    elsif new.response is distinct from old.response or new.status is distinct from old.status then
      insert into public.notifications(user_id, source_key, message) values(new.author_id, 'concern:' || new.id || ':' || new.updated_at, 'Your health concern was updated: ' || new.status) on conflict do nothing;
    end if;
  elsif tg_table_name = 'appointments' then
    target_mother := new.mother_id;
    if target_mother is null then select mother_id into target_mother from public.infants where id = new.infant_id; end if;
    for recipient in select user_id from public.mother_accounts where mother_id = target_mother union select caregiver_id from public.caregiver_assignments where mother_id = target_mother and status = 'approved' loop
      insert into public.notifications(user_id, source_key, message) values(recipient.user_id, 'appointment-update:' || new.id || ':' || new.updated_at, new.service || ': ' || new.status || ', ' || to_char(new.scheduled_at at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI') || ' (Philippine time).') on conflict do nothing;
    end loop;
  end if;
  return new;
end; $$;
create trigger concern_notifications after insert or update on public.health_concerns for each row execute function public.notify_care_events();
create trigger appointment_notifications after insert or update on public.appointments for each row execute function public.notify_care_events();

-- Atomic maternal intake update and corresponding clinical history entry.
create or replace function public.save_maternal_intake(patient_id uuid, values_json jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  update public.mothers set maternal_status = lower(values_json->>'status'),
    gestation_weeks = nullif(values_json->>'gestationWeeks','')::integer,
    gestation_date = nullif(values_json->>'gestationDate','')::date,
    delivery_date = nullif(values_json->>'deliveryDate','')::date,
    care_plan = values_json - 'status' - 'gestationWeeks' - 'gestationDate' - 'deliveryDate'
    where id = patient_id;
  if not found then raise exception 'Patient not found'; end if;
  insert into public.maternal_records(mother_id, record_type, details, recorded_by)
  values(patient_id, (values_json->>'status') || ' intake / update', values_json->>'hospitalSummary', auth.uid());
end; $$;
revoke all on function public.save_maternal_intake(uuid,jsonb) from public, anon;
grant execute on function public.save_maternal_intake(uuid,jsonb) to authenticated;
-- Only the notification server functions may create messages.
revoke insert, delete on public.notifications from anon, authenticated;
-- Rules mirror the existing immunization checklist, including previous-dose intervals.
create table public.vaccine_reminder_rules (
 id text primary key, vaccine text not null, dose text not null, age_days integer not null,
 age_months integer not null, previous_id text, interval_days integer not null, interval_months integer not null
);
alter table public.vaccine_reminder_rules enable row level security;
insert into public.vaccine_reminder_rules values ('bcg','BCG','Birth dose',0,0,null,0,0),
('hepb','Hepatitis B','Birth dose',0,0,null,0,0),
('pentavalent-1','Pentavalent','Dose 1',42,0,null,28,0),
('pentavalent-2','Pentavalent','Dose 2',70,0,'pentavalent-1',28,0),
('pentavalent-3','Pentavalent','Dose 3',98,0,'pentavalent-2',28,0),
('opv-1','OPV','Dose 1',42,0,null,28,0),
('opv-2','OPV','Dose 2',70,0,'opv-1',28,0),
('opv-3','OPV','Dose 3',98,0,'opv-2',28,0),
('pcv-1','PCV','Dose 1',42,0,null,28,0),
('pcv-2','PCV','Dose 2',70,0,'pcv-1',28,0),
('pcv-3','PCV','Dose 3',98,0,'pcv-2',28,0),
('ipv-1','IPV','Dose 1',98,0,null,0,0),
('ipv-2','IPV','Dose 2',0,9,'ipv-1',0,4),
('mmr-1','MMR','Dose 1',0,9,null,0,0),
('mmr-2','MMR','Dose 2',0,12,'mmr-1',28,0);
create or replace function public.generate_vaccine_reminders()
returns void language sql security definer set search_path = public as $$
 insert into public.notifications(user_id, source_key, message)
 select distinct recipient.user_id, 'vaccine:' || i.id || ':' || r.id || ':' || due.due_date,
   'An immunization dose in your linked family is due for health worker review from ' || due.due_date || '. Open infant records for details.'
 from public.infants i
 join public.mothers m on m.id = i.mother_id
 cross join public.vaccine_reminder_rules r
 left join public.vaccine_reminder_rules pr on pr.id = r.previous_id
 left join public.vaccinations previous on previous.infant_id = i.id and previous.vaccine = pr.vaccine and previous.dose = pr.dose
 cross join lateral (select greatest(
   (i.birth_date + make_interval(days => r.age_days, months => r.age_months))::date,
   (previous.administered_at + make_interval(days => r.interval_days, months => r.interval_months))::date
 ) as due_date) due
 cross join lateral (
   select user_id from public.mother_accounts where mother_id = i.mother_id
   union select caregiver_id from public.caregiver_assignments where mother_id = i.mother_id and status = 'approved'
 ) recipient
 where i.status = 'active' and m.status <> 'archived'
 and (r.previous_id is null or previous.id is not null)
 and due.due_date <= (now() at time zone 'Asia/Manila')::date + 7
 and not exists(select 1 from public.vaccinations v where v.infant_id = i.id and v.vaccine = r.vaccine and v.dose = r.dose)
 on conflict(user_id, source_key) do nothing;
$$;
revoke all on function public.generate_vaccine_reminders() from public, anon, authenticated;

commit;
