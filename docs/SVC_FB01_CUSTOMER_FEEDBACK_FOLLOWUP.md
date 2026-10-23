# SVC-FB01 — Staff-Recorded Customer Feedback / Manual Review Follow-up

Customer-facing scope: once an actual field visit is **completed**, authorized
staff may record a **customer-volunteered** rating (1–5) plus comment and
response source (in person, phone or WhatsApp reply), or record that the
customer explicitly declined to respond, including a reason. An attestation
checkbox is required in the UI and enforced by the domain.

New site visits have a single nullable \`feedback\` response. Recording is
one-time, visit-version locked and branch/order/customer verified; completed
or delivered service orders remain eligible. The feedback is retained in the
existing Windows Offline SQLite domain snapshot, export/backup and restore.
Legacy visits lacking this optional field import unchanged and are not forced
to collect historical feedback. Snapshot data is fail-closed validated before
hydration, and reads deep-clone customer text.

Ratings of 1–2 trigger a **private recovery priority** indicator. They do
not auto-contact customers or automatically turn into warranty tickets.
Negative ratings are **not suppressed** from Google review invitations:
the same optional, neutral review draft is available for every completed
visit regardless of rating or feedback outcome. It never posts a rating,
a review or a customer message automatically.

Explicit consent is required to open a customer WhatsApp draft. Staff may
use the saved customer WhatsApp/phone or manually enter a country-coded
number and optional official Google review HTTPS URL. Existing
\`buildManualServiceWhatsAppLink\` and \`parseGoogleReviewUrl\` prevent
unexpected hosts or malformed recipients. Opening WhatsApp is not proof of
delivery. Customer responses are **staff-transcribed**, not a
verified, customer-authenticated survey.

Important limits:
- No paid WhatsApp/Google API, no auto-send, notifications, bulk contact,
  review-gating, public-review submission, delivery confirmation or CRM
  external write.
- No automatic claim of customer identity; the consent box records only
  staff attestation, not legally verified consent.
- Feedback comments are excluded from audit event payloads; only rating,
  outcome, source and time are audited.
- Existing \`orders.assign\` role plus active branch/customer relation
  guard writes. Hosted production Web remains read-only for writes, pending
  tenant-safe online sync; the opt-in draft can still be opened manually.
- No cloud migration, paid infrastructure, GL/stock write or new installer.

Regression tests:
- \`packages/business-logic/src/__tests__/service-visit-feedback.test.mjs\`
- \`packages/business-logic/src/__tests__/service-site-visit-register.test.mjs\`

Require PR exact-head CI, Web/Desktop typechecks, Windows installed smoke,
coverage, static security checks and post-merge main CI before source
acceptance. This does not claim customer UAT, a released Windows installer
or Cloud/Offline/Hybrid feedback parity.
