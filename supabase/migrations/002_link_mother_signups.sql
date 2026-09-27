-- Automatically create and link a maternal record for new Mother sign-ups.
-- Run once in Supabase SQL Editor after 001_initial_schema.sql.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_mother_id uuid;
  requested_role text := coalesce(new.raw_user_meta_data ->> 'requested_role', 'mother');
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));

  if requested_role = 'mother' then
    insert into public.mothers (record_code, full_name, contact_number, address)
    values (
      'M-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'contact_number', ''),
      nullif(new.raw_user_meta_data ->> 'address', '')
    ) returning id into new_mother_id;
    insert into public.mother_accounts (mother_id, user_id) values (new_mother_id, new.id);
  end if;
  return new;
end; $$;

-- Link existing non-admin mother profiles that were registered before this migration.
insert into public.mothers (record_code, full_name, contact_number, address)
select 'M-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), p.full_name, p.phone, null
from public.profiles p
where p.role = 'mother'
  and not exists (select 1 from public.mother_accounts ma where ma.user_id = p.id);

insert into public.mother_accounts (mother_id, user_id)
select m.id, p.id
from public.profiles p
join public.mothers m on m.full_name = p.full_name
where p.role = 'mother'
  and not exists (select 1 from public.mother_accounts ma where ma.user_id = p.id);
