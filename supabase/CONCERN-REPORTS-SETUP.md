# Concern reports

Apply `019_concern_reports.sql` once in Supabase SQL Editor, after the earlier migrations through 018. Do not rerun migrations that already succeeded. This migration changes the database: it adds report fields, conversation and attachment tables, notification links, and a private `concern-images` storage bucket with access policies. Existing concerns and earlier replies are preserved.

1. Open `supabase/migrations/019_concern_reports.sql` in VS Code and copy its entire contents.
2. In your existing Supabase project, open SQL Editor, create a new query, paste and Run.
3. After success, refresh the application. No new API key, cron schedule or environment variable is required.

Test with separate mother, approved caregiver and admin accounts:

- Mother/caregiver: Reports → New report. Select a linked patient, Post-vaccination, enter the subject and description, add optional details and up to three JPG/PNG/WebP photos (5 MB each), then submit.
- Admin: Reports → Concern reports. Open the submitted report, inspect its photos, write a reply and select Under review or Resolved.
- Reporter: open Notifications → View report, read the reply, then send a follow-up. A follow-up reopens a resolved report. The inbox refreshes every 15 seconds; an open conversation refreshes every 30 seconds.
- An unrelated family account must not see the report or its images. A caregiver whose assignment is revoked loses report access.

If a photo upload fails, the report remains submitted. Add the photo again in its details rather than submitting a duplicate report. Signed image links expire after five minutes and are refreshed while the report is open.

The Healthcare summary tab retains clinical activity exports. Existing clinical backup exports do not include report conversations or storage photos; use your database/storage backup process to preserve those.

Local tests cover database authorization and reply flow using synthetic records, plus form validation and browser layout. Real Supabase uploads and replies still need the account-based test above after installation. These reports and notifications are in-app, not SMS or email.
