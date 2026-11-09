-- Promote a mother to Postnatal when a postnatal maternal record is saved.
-- Run this migration after 035_philippine_timezone_consistency.sql.

begin;

create or replace function public.sync_mother_postnatal_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.mother_id is not null and lower(coalesce(new.record_type, '')) like '%postnatal%' then
    update public.mothers
    set maternal_status = 'postnatal',
        delivery_date = case
          when maternal_status = 'postnatal' then delivery_date
          else coalesce(new.record_date, delivery_date)
        end
    where id = new.mother_id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_mother_postnatal_status on public.maternal_records;
create trigger sync_mother_postnatal_status
after insert or update of record_type, record_date, mother_id on public.maternal_records
for each row execute function public.sync_mother_postnatal_status();

-- Backfill mothers that already have a postnatal record.
update public.mothers as m
set maternal_status = 'postnatal',
    delivery_date = coalesce(m.delivery_date, records.first_postnatal_date)
from (
  select mother_id, min(record_date) as first_postnatal_date
  from public.maternal_records
  where lower(coalesce(record_type, '')) like '%postnatal%'
  group by mother_id
) as records
where m.id = records.mother_id
  and m.maternal_status <> 'postnatal';

notify pgrst, 'reload schema';
commit;
