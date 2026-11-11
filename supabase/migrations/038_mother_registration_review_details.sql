-- Store the mother registration email and private valid ID for administrator review.
-- Run after 028_caregiver_registration_details.sql and the mother approval migrations.
begin;

alter table public.mothers add column if not exists email text;
alter table public.mothers add column if not exists valid_id_path text;
alter table public.mothers add column if not exists valid_id_name text;

create index if not exists mothers_email_idx on public.mothers(email);

-- The existing private caregiver-ids bucket is also used for mother IDs.
-- Keep the bucket private; administrators read files through signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('caregiver-ids', 'caregiver-ids', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;

commit;
