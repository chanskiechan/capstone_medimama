-- Mother self-service contact and avatar support. Run once in Supabase SQL Editor.

alter table public.profiles add column if not exists avatar_url text;

create or replace function public.update_my_contact(new_phone text)
returns void language plpgsql security definer set search_path = public as $$
declare linked_mother uuid;
begin
  if not public.is_mother() then raise exception 'Only mother accounts can update this contact number'; end if;
  if new_phone !~ '^9[0-9]{9}$' then raise exception 'Enter a valid 10-digit Philippine mobile number'; end if;
  update public.profiles set phone = new_phone where id = auth.uid();
  select mother_id into linked_mother from public.mother_accounts where user_id = auth.uid();
  if linked_mother is not null then update public.mothers set contact_number = new_phone where id = linked_mother; end if;
end; $$;

create or replace function public.update_my_avatar(new_avatar_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_mother() then raise exception 'Only mother accounts can update this profile photo'; end if;
  update public.profiles set avatar_url = new_avatar_url where id = auth.uid();
end; $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars: owner uploads" on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: owner updates" on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: public read" on storage.objects for select to public using (bucket_id = 'avatars');
