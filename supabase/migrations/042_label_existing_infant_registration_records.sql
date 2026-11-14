-- Existing admin-created registration measurements were recorded with the
-- operator UUID before the human-readable recorder field was added.
begin;

update public.growth_records
set recorded_by_label = 'Health Center'
where recorded_by_label is null
  and notes = 'Registration measurement: health center';

commit;
