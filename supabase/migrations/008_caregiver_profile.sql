-- Caregiver profile self-service. Run once after migration 005.

create or replace function public.update_my_caregiver_contact(new_phone text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_caregiver() then raise exception 'Only caregiver accounts can update this contact number'; end if;
  if new_phone !~ '^9[0-9]{9}$' then raise exception 'Enter a valid 10-digit Philippine mobile number'; end if;
  update public.profiles set phone = new_phone where id = auth.uid();
end; $$;

create or replace function public.update_my_caregiver_avatar(new_avatar_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_caregiver() then raise exception 'Only caregiver accounts can update this profile photo'; end if;
  update public.profiles set avatar_url = new_avatar_url where id = auth.uid();
end; $$;
