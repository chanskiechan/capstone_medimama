# Maternal and infant care workflows

The document `Eto pa yung kulang sa system.docx`, including its immunization-card image, is implemented in the React care workspace.

## Use the features

1. In **Patient Management → Mother**, create the mother's profile if it does not exist.
2. In **Dashboard → Account & caregiver links**, select a registered account and its mother record. This approves the account. Caregiver approval requires confirming that the mother was contacted and gave consent. Access can be revoked here.
3. Use **Update intake / delivery** to record hospital information, a PDF/image attachment, gestational age with an assessment date, prior prenatal visits, and the planned number of visits. Record the delivery date and Postnatal status after delivery.
4. Mothers can register infants; the admin approves them from the shared infant record. The record contains birth and family information, weight, length, and MUAC. Health workers add subsequent measurements, clinic visits, screenings, and administered vaccine doses.
5. Use **Book appointment** or **Reschedule**. Reasons and previous schedules remain visible to the admin and linked family accounts. Admins mark attendance and record clinical findings separately.

## Scheduling decisions

- Wednesday only; infant services start at 08:00, maternal services at 10:00, and both end at 17:00.
- The user confirmed **20 appointments per service group per Wednesday**: maternal care and infant services each have their own capacity.
- Appointments use 30-minute arrival slots, with up to two patients per slot per group. The final arrival slot is 16:30. This permits the requested daily capacity during the clinic hours.
- The same patient cannot book the same service twice on one date or occupy two services at the same time. Rescheduling replaces the existing booking and preserves its history.
- The maternal plan defaults to eight visits. Recorded prior hospital visits count toward that plan; gestational month alone is not treated as proof of a completed visit. The next monthly visit suggestion advances to a Wednesday. The health worker can adjust the plan.
- A reminder identifies infants without a recorded clinic visit/attendance within the first 42 days after birth. Screening completion is tracked independently.

## Vaccine schedule references

The checklist includes BCG, hepatitis B birth dose, pentavalent, OPV, IPV, PCV, and MMR from the supplied card. Completion requires an administration date and provider. Existing completed records are recognized; a due reminder does not count as completion.

- [DOH National Immunization Program, conducting immunization sessions](https://doh.gov.ph/wp-content/uploads/2023/08/Booklet-4-Conducting-Immunization-Sessions.pdf): birth doses, pentavalent/OPV/PCV at 6, 10, and 14 weeks, and MMR at 9 and 12 months.
- [2026 PIDSP childhood immunization calendar](https://www.pidsphil.org/home/wp-content/uploads/2025/11/2026-PIDSP-Immunization-Calendar.pdf): NIP IPV doses at 14 weeks and 9 months.
- [HTAC evidence on two-dose IPV](https://hta.dost.gov.ph/wp-content/uploads/2021/09/HTAC-Recommendation-and-ES-on-Two-dose-IPV.pdf): four-month interval between IPV doses.

Age and previous-dose intervals are checked against the actual administration date. Late doses retain the original series; the minimum interval is recalculated from the previous administration date. This implements schedule checks, not a complete clinical eligibility or catch-up assessment. The administering health worker confirms suitability.

## Persistence and access

The existing frontend uses `localStorage`. Admin, mother, and caregiver views now read the same patient records and update across tabs on the same browser origin. Patient access is matched by account ID/email and approved caregiver links; names alone do not grant account access. Existing legacy appointments are linked by name only when exactly one patient matches.

This is still a frontend prototype: browser storage and role checks are not server authorization, and separate devices do not synchronize. A backend is required for production authentication, document storage, authorization, and transactional appointment capacity. Hospital attachments are limited to 1 MB each to accommodate browser storage; write failures are shown without marking the save successful.

Existing patient data is preserved. Historical dates are not silently rewritten to Wednesdays; new bookings and rescheduling use the new rules.

## Verification

- `npm test`: appointment windows/capacity, duplicate prevention, vaccine ages/intervals, account scoping, gestation, and legacy-data handling.
- `npm run test:ui`: uses a separate headless Chrome profile and fixture data; verifies registration, approval, clinical records, rescheduling, persistence, caregiver access, and mobile overflow. Requires Chrome at the Windows path configured in the script.
- `npm run build`: production bundle.

Browser screenshots are saved in `artifacts/` by the UI check. Test data is kept in an isolated browser profile and does not replace the user's browser data.
