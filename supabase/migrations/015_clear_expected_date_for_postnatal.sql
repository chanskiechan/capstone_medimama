-- Clear the expected delivery date when a mother becomes Postnatal.
-- Run once in Supabase SQL Editor after migrations 001 through 014.

create or replace function public.update_my_mother_profile(
  new_full_name text,
  new_address text,
  new_phone text,
  new_maternal_status text,
  new_delivery_date date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_mother_id uuid;
begin
  if not public.is_mother() then
    raise exception 'Only mother accounts can update this profile';
  end if;
  if coalesce(trim(new_full_name), '') = '' then
    raise exception 'Enter your full name';
  end if;
  if new_phone !~ '^09[0-9]{9}$' then
    raise exception 'Enter a valid 11-digit Philippine mobile number starting with 09';
  end if;
  if new_maternal_status not in ('pregnant', 'postnatal') then
    raise exception 'Choose Prenatal or Postnatal';
  end if;
  if new_maternal_status = 'pregnant' and new_delivery_date is null then
    raise exception 'Enter the expected delivery date for a prenatal record';
  end if;
  if new_maternal_status = 'pregnant' and new_delivery_date < current_date then
    raise exception 'Expected delivery date cannot be in the past';
  end if;

  select mother_id into linked_mother_id
  from public.mother_accounts
  where user_id = auth.uid();

  if linked_mother_id is null then
    raise exception 'No mother record is linked to this account';
  end if;

  update public.profiles
  set full_name = trim(new_full_name), phone = new_phone
  where id = auth.uid();

  update public.mothers
  set full_name = trim(new_full_name),
      address = nullif(trim(new_address), ''),
      contact_number = new_phone,
      maternal_status = new_maternal_status,
      delivery_date = case when new_maternal_status = 'pregnant' then new_delivery_date else null end
  where id = linked_mother_id;
end;
$$;

notify pgrst, 'reload schema';
