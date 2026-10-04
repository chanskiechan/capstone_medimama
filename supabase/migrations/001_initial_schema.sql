-- MediMama initial database schema
-- Run this file in Supabase Dashboard > SQL Editor, or with the Supabase CLI.
-- This migration intentionally contains no patient/demo data.

create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'mother', 'caregiver');
create type public.patient_status as enum ('active', 'pending_approval', 'needs_follow_up', 'archived');
create type public.appointment_status as enum ('scheduled', 'rescheduled', 'completed', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.user_role not null default 'mother',
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mothers (
  id uuid primary key default gen_random_uuid(),
  record_code text not null unique,
  full_name text not null,
  birth_date date,
  contact_number text,
  address text,
  blood_type text,
  maternal_status text not null default 'pregnant' check (maternal_status in ('pregnant', 'postnatal')),
  risk_level text not null default 'routine' check (risk_level in ('routine', 'moderate', 'high')),
  gestation_date date,
  gestation_weeks integer check (gestation_weeks between 0 and 45),
  delivery_date date,
  notes text,
  status public.patient_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mother_accounts (
  mother_id uuid primary key references public.mothers(id) on delete cascade,
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  linked_at timestamptz not null default now()
);

create table public.infants (
  id uuid primary key default gen_random_uuid(),
  record_code text not null unique,
  mother_id uuid not null references public.mothers(id) on delete restrict,
  full_name text not null,
  birth_date date not null,
  sex text check (sex in ('female', 'male', 'other')),
  place_of_birth text,
  birth_weight_kg numeric(5,2) check (birth_weight_kg >= 0),
  birth_length_cm numeric(5,2) check (birth_length_cm >= 0),
  blood_type text,
  guardian_name text,
  guardian_contact text,
  allergies text,
  medical_notes text,
  status public.patient_status not null default 'pending_approval',
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (birth_date <= current_date)
);

create table public.caregiver_assignments (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.profiles(id) on delete cascade,
  mother_id uuid not null references public.mothers(id) on delete cascade,
  relationship text not null,
  consent_confirmed_at timestamptz not null,
  status text not null default 'approved' check (status in ('pending', 'approved', 'revoked')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (caregiver_id, mother_id)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  mother_id uuid references public.mothers(id) on delete cascade,
  infant_id uuid references public.infants(id) on delete cascade,
  service text not null,
  reason text,
  scheduled_at timestamptz not null,
  status public.appointment_status not null default 'scheduled',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((mother_id is null) <> (infant_id is null))
);

create table public.care_tasks (
  id uuid primary key default gen_random_uuid(),
  infant_id uuid not null references public.infants(id) on delete cascade,
  title text not null,
  instructions text,
  due_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (completed_at is null or due_at is null or completed_at >= due_at - interval '1 day')
);

create table public.maternal_records (
  id uuid primary key default gen_random_uuid(),
  mother_id uuid not null references public.mothers(id) on delete cascade,
  record_date date not null default current_date check (record_date <= current_date),
  record_type text not null,
  details text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.growth_records (
  id uuid primary key default gen_random_uuid(),
  infant_id uuid not null references public.infants(id) on delete cascade,
  measured_at date not null check (measured_at <= current_date),
  weight_kg numeric(5,2) check (weight_kg >= 0),
  length_cm numeric(5,2) check (length_cm >= 0),
  muac_cm numeric(5,2) check (muac_cm >= 0),
  notes text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (infant_id, measured_at)
);

create table public.vaccinations (
  id uuid primary key default gen_random_uuid(),
  infant_id uuid not null references public.infants(id) on delete cascade,
  vaccine text not null,
  dose text not null,
  administered_at date not null check (administered_at <= current_date),
  provider text,
  notes text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (infant_id, vaccine, dose)
);

create index infants_mother_id_idx on public.infants(mother_id);
create index caregiver_assignments_lookup_idx on public.caregiver_assignments(caregiver_id, mother_id) where status = 'approved';
create index appointments_scheduled_at_idx on public.appointments(scheduled_at);
create index care_tasks_infant_id_idx on public.care_tasks(infant_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger mothers_updated_at before update on public.mothers for each row execute function public.set_updated_at();
create trigger infants_updated_at before update on public.infants for each row execute function public.set_updated_at();
create trigger appointments_updated_at before update on public.appointments for each row execute function public.set_updated_at();

-- New sign-ups receive a non-privileged mother profile. Promote admin/caregiver roles
-- only from a trusted backend using the service-role key.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Authorization helpers. Security definer keeps RLS policies concise; search_path is fixed.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
create or replace function public.is_caregiver()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'caregiver');
$$;
create or replace function public.can_access_mother(target_mother_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or exists (select 1 from public.mother_accounts where mother_id = target_mother_id and user_id = auth.uid())
    or exists (select 1 from public.caregiver_assignments where mother_id = target_mother_id and caregiver_id = auth.uid() and status = 'approved');
$$;
create or replace function public.can_access_infant(target_infant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.infants i where i.id = target_infant_id and public.can_access_mother(i.mother_id));
$$;

alter table public.profiles enable row level security;
alter table public.mothers enable row level security;
alter table public.mother_accounts enable row level security;
alter table public.infants enable row level security;
alter table public.caregiver_assignments enable row level security;
alter table public.appointments enable row level security;
alter table public.care_tasks enable row level security;
alter table public.maternal_records enable row level security;
alter table public.growth_records enable row level security;
alter table public.vaccinations enable row level security;

-- Patients and caregivers can read only records linked to their account. All writes
-- to clinical/patient records are admin-only; a Node backend performs privileged work.
create policy "profiles: read own or admin" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles: admin manages" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "mothers: read linked" on public.mothers for select to authenticated using (public.can_access_mother(id));
create policy "mothers: admin manages" on public.mothers for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "mother accounts: read linked" on public.mother_accounts for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "mother accounts: admin manages" on public.mother_accounts for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "infants: read linked" on public.infants for select to authenticated using (public.can_access_infant(id));
create policy "infants: admin manages" on public.infants for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "assignments: read own or admin" on public.caregiver_assignments for select to authenticated using (caregiver_id = auth.uid() or public.is_admin());
create policy "assignments: admin manages" on public.caregiver_assignments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "appointments: read linked" on public.appointments for select to authenticated using ((mother_id is not null and public.can_access_mother(mother_id)) or (infant_id is not null and public.can_access_infant(infant_id)));
create policy "appointments: admin manages" on public.appointments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "tasks: read linked" on public.care_tasks for select to authenticated using (public.can_access_infant(infant_id));
create policy "tasks: caregiver completes linked" on public.care_tasks for update to authenticated using (public.is_caregiver() and public.can_access_infant(infant_id)) with check (public.is_caregiver() and public.can_access_infant(infant_id));
create policy "tasks: admin manages" on public.care_tasks for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "maternal records: read linked" on public.maternal_records for select to authenticated using (public.can_access_mother(mother_id));
create policy "maternal records: admin manages" on public.maternal_records for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "growth: read linked" on public.growth_records for select to authenticated using (public.can_access_infant(infant_id));
create policy "growth: admin manages" on public.growth_records for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "vaccinations: read linked" on public.vaccinations for select to authenticated using (public.can_access_infant(infant_id));
create policy "vaccinations: admin manages" on public.vaccinations for all to authenticated using (public.is_admin()) with check (public.is_admin());
