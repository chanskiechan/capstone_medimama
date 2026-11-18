-- Store the date and clinic time attached to a health-center announcement.
-- Run this migration in Supabase before publishing announcements with a schedule.

alter table public.announcements
  add column if not exists event_date date,
  add column if not exists event_time time;

create index if not exists announcements_event_date_idx
  on public.announcements (event_date, event_time)
  where archived = false;
