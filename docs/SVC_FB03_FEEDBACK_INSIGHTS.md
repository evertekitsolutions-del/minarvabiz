# SVC-FB03 — Offline Customer Feedback Insights and Follow-up

## Outcome
In Services → Field Service Site Visits, an authorized manager with
\`reports.view\` sees a read-only, branch-scoped summary of feedback personally
reported to staff after completed visits:

- Staff-recorded rating distribution (1–5), average rating, response rate and
  declined feedback. Legacy visits without the feedback feature are excluded
  from the response-rate denominator, with their count made visible.
- Low ratings (1–2), unopened recovery cases, due-today and overdue recovery
  cases, and manual staff follow-up queue. No automatic contacting.
- Calendar range for **completed visit date in UTC**, monthly grouped counts,
  and CSV export protected against spreadsheet formula injection.
- The CSV intentionally omits customer comments, phone numbers, signatures,
  photographs and other confidential service-visit attachments.

Existing SVC-FB01 recorded customer responses and SVC-FB02 recovery state are
the only inputs. These records are staff-attested and **not independently
verified** customer opinions. A private recovery queue does not gate public
review requests, which remain optional for all customers.

## Security and architecture
Only the previously authorized \`listServiceSiteVisits()\` active-branch output
is used. The report rejects duplicated visit IDs, mixed branches, malformed
feedback/recovery chronology and invalid dates. No new persistence, outbox,
financial/stock writes, cloud APIs, paid infrastructure, background reminders,
WhatsApp sending or customer targeting are added. Source Web production visit
editing remains read-only. Legacy backups remain untouched.

## Acceptance boundary
Target regression:
\`packages/business-logic/src/__tests__/service-feedback-insights.test.mjs\`,
including source wiring and no customer PII in exported CSV.

Merge requires exact-head GitHub CI, coverage, Desktop/Web and installed
Windows checks, followed by post-merge main CI review. A source merge is not
a new customer installer release, and Offline/Online/Hybrid customer UAT is
not represented as complete.
