-- When an administrator removes a mother patient record, remove the login
-- account linked exclusively to that mother as well. Deleting auth.users also
-- cascades to public.profiles and clears the remaining account relationships.
--
-- Run this once in Supabase SQL Editor after migrations 001 through 011.

create or replace function public.delete_linked_mother_auth()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  linked_user_id uuid;
begin
  select user_id into linked_user_id
  from public.mother_accounts
  where mother_id = old.id;

  if linked_user_id is not null then
    delete from auth.users where id = linked_user_id;
  end if;

  return old;
end;
$$;

drop trigger if exists delete_linked_mother_auth_on_delete on public.mothers;

create trigger delete_linked_mother_auth_on_delete
before delete on public.mothers
for each row execute function public.delete_linked_mother_auth();
