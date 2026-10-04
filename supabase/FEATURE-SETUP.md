# Activate the added features

The app changes are implemented locally. Your live Supabase database has not been changed.
Migration 016 is based on the schema CSV you supplied. It preserves existing tables and records.

For Mother-side appointment confirmation and time-only rescheduling, also run
`supabase/migrations/021_mother_appointment_actions.sql` after migration 020.
The Mother can confirm an appointment scheduled by the health center or submit a
new-time request; the appointment date and service remain controlled by the
health center.

1. In VS Code, press **Ctrl+P**, type `016_complete_care_features.sql`, then press Enter.
2. Copy all the SQL. In your Supabase project, open **SQL Editor**, create a new query, paste it, and click **Run** once.
3. If Supabase reports an error, keep the full error message. The migration uses a transaction, so a failed run does not leave half the update applied. Do not rerun a successful migration.
4. Restart the app with `npm run dev`. Log in with a real account to test saving and sharing records.

## Turn on scheduled reminders

Enable the **pg_cron** extension from your project's database extensions screen. Then run `supabase/schedule-reminders.sql` in SQL Editor. This installs hourly appointment and vaccination reminder jobs and runs both once immediately.

These are **in-app inbox notifications**. No email, SMS, or push delivery service is configured. Notifications are generated in the database even with the browser closed, and the inbox refreshes while open. Appointment updates and concern replies use database triggers and do not depend on cron. Vaccine reminders require health-worker review and are not medical clearance to administer a dose.

## Where to find the features

- Mother/caregiver header → **Family support**: health education, concerns, notifications, and the guided health assistant.
- Mother dashboard → **Chat with us**: the same assistant. It answers supported education topics and retrieves linked appointments/reminders. It is a rules-based assistant, not an external AI model or diagnostic service.
- Admin → **Health concerns**: review submissions and send replies.
- Admin → **Reports**: date-filtered maternal checkups, infant visits, screening, growth, vaccinations and appointments; CSV export and print/save as PDF.
- Admin → **Patient archives**: search, archive, restore and retrieve clinical history. This is record archiving, not a full Supabase database backup.
- Existing care forms now write measurements, vaccinations, screenings and maternal intake/history to Supabase. Infant registration saves its initial measurements in the same transaction. Patient data is loaded in pages, rather than silently stopping at Supabase's default row limit.

Existing browser-only records are not automatically imported into the database. The previous localStorage contents are left untouched. Do not clear browser storage if those records need to be recovered; they require a reviewed import to match patients and avoid duplicates.

## Verification

- `npm test`: scheduling, vaccine intervals, record mapping, reporting, CSV escaping and assistant account scoping.
- `npm run test:database`: uses isolated PostgreSQL in memory with synthetic data; verifies migration, registration/clinical persistence, row-level permissions, concern replies, archive restoration and reminder deduplication. It does not connect to Supabase.
- `npm run test:ui`: isolated headless Chrome on Windows, dummy Supabase settings, external requests blocked. Verifies the support pages, educational answers, report display and mobile layout. Screenshot: `artifacts/support-mobile.png`.
- `npm run build`: production build. In environments that restrict child processes, use `npm run build -- --configLoader native` and `node --test --test-isolation=none src/care.test.js src/support.test.js`.

The actual Supabase migration, cron extension/job activation and real-account acceptance tests still need to happen in your project. The older browser script `scripts/check-care-ui.mjs` targets the previous localStorage prototype and is retained only as a historical reference.

Education text links to the WHO sources in `src/healthResources.js` (reviewed September 29, 2026). A health worker should review content for local clinic use.
