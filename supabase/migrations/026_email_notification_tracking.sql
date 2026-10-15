-- Track reminder notifications already delivered by the Nodemailer service.
-- Existing in-app notifications are marked as already handled so enabling the
-- email server does not resend the old inbox history.

alter table public.notifications
  add column if not exists email_sent_at timestamptz;

update public.notifications
set email_sent_at = now()
where email_sent_at is null;
