-- Track appointment and vaccine reminder SMS deliveries separately from email.
-- Existing notifications are considered already handled so enabling SMS does
-- not resend old reminder records from the inbox.

alter table public.notifications
  add column if not exists sms_sent_at timestamptz;

update public.notifications
set sms_sent_at = now()
where sms_sent_at is null;
