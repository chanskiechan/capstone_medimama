-- Keep the health-center recorder label selected in the clinical form.
-- The auth user remains in recorded_by for audit history; this label is the
-- human-readable recorder choice shown in the shared record history.
do $$
declare
  table_name text;
  constraint_name text;
begin
  foreach table_name in array array['maternal_records', 'growth_records', 'vaccinations', 'infant_records'] loop
    execute format('alter table public.%I add column if not exists recorded_by_label text', table_name);
    constraint_name := table_name || '_recorded_by_label_check';
    execute format('alter table public.%I drop constraint if exists %I', table_name, constraint_name);
    execute format(
      'alter table public.%I add constraint %I check (recorded_by_label is null or recorded_by_label in (''Irene S. Andres'', ''Health Center''))',
      table_name,
      constraint_name
    );
  end loop;
end $$;
