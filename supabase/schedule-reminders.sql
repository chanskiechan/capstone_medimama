-- Run AFTER migration 016 in Supabase SQL Editor using the postgres role.
-- Enable the scheduler before creating the two named hourly jobs.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Creates or updates the named jobs. Messages appear in the app inbox.
select cron.schedule('medimama-appointment-reminders', '0 * * * *',
  'select public.generate_appointment_reminders();');
select public.generate_appointment_reminders();
select cron.schedule('medimama-vaccine-reminders', '15 * * * *',
  'select public.generate_vaccine_reminders();');
select public.generate_vaccine_reminders();

-- Confirm both jobs were installed and are active.
select jobname, schedule, active from cron.job
where jobname in ('medimama-appointment-reminders', 'medimama-vaccine-reminders');
