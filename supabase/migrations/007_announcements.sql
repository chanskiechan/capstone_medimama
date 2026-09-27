-- Health-center announcements shown to mothers and caregivers.
-- Run once in the Supabase SQL Editor after migrations 001 through 006.

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  description text not null check (char_length(description) between 1 and 2000),
  audience text not null default 'Mothers & caregivers'
    check (audience in ('Mothers & caregivers', 'Everyone')),
  priority text not null default 'Normal'
    check (priority in ('Low', 'Normal', 'High')),
  pinned boolean not null default false,
  archived boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists announcements_visible_idx
  on public.announcements (pinned desc, created_at desc) where archived = false;

alter table public.announcements enable row level security;

create policy "announcements: authenticated users read visible"
on public.announcements for select to authenticated
using (archived = false or public.is_admin());

create policy "announcements: admin manages"
on public.announcements for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop trigger if exists announcements_updated_at on public.announcements;
create trigger announcements_updated_at before update on public.announcements
for each row execute function public.set_updated_at();
