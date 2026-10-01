# Activate the remaining admin features

The guided chatbot is ready to test without this migration. Open **Family support → Health assistant**, or **Chat with us** on the mother dashboard. Try:

- `When is my next appointment?`
- `Vaccines due`
- `Family planning`
- `Pagpapasuso`

It supports these topics and linked records using rules and WHO resources. It is not a general-purpose AI model, a diagnostic service, or a substitute for a health worker. Education still works when records cannot be loaded; record questions explain the connection problem rather than claiming there are no records. Chat history stays in the current page session.

## Install the new database update

1. In VS Code press **Ctrl+P**, type `017_admin_tools.sql`, and press Enter.
2. Copy the whole file into a **new Supabase SQL Editor query**, using the postgres role.
3. Run it **once**. Do not rerun migration 016; it is already installed.

Then refresh MediMama. **Admin → System** now has real audit events, clinical backup download, and restore with a preview. **Admin → Profile** reads and saves the signed-in account's name and contact number.

Audit events begin when 017 is installed; they cannot reconstruct past activity. They record actor IDs, record IDs, table names and actions, not copies of medical descriptions. Audit logs can be read only by administrators and cannot be edited through the app.

Clinical backup includes eight patient/clinical tables. It excludes login accounts, access links, announcements and notifications; it is not a full Supabase disaster-recovery backup. Restore works within the same project, inserts missing IDs, leaves existing records unchanged and rolls back if any row is invalid. Referenced login accounts must still exist. Backups contain patient information and should be stored privately.

## Enable password recovery redirects

The login page's **Forgot Password?** button now opens the email recovery form. In Supabase **Authentication → URL Configuration**, add the actual app URL followed by `/reset-password` to the redirect allow list. For example, if Vite runs on port 5173:

`http://localhost:5173/reset-password`

Add the deployed HTTPS URL when deploying. Password reset emails are sent through Supabase Auth's configured mail service and remain subject to its email-provider restrictions and rate limits. Delivery and the email-link flow require a real-account test; local browser tests do not send mail. See [Supabase password recovery](https://supabase.com/docs/guides/auth/passwords).

## Test after installation

1. Save an administrator profile change, open System → Audit logs, and confirm the event appears.
2. Download a clinical backup and choose it in Restore. Review the counts. Restoring that same unchanged backup should report zero inserted records.
3. Test password recovery using an account you control.
4. Test appointments, concerns and clinical records with separate mother/caregiver/admin accounts. Local checks do not establish that every live-account workflow is working.

Google Maps remains excluded. Routine appointment/vaccine notifications remain in-app; SMS and email reminders are not configured. The previously activated cron schedules do not need to be run again.
