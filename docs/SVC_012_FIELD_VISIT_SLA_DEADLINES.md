# SVC-012 — Offline Field Visit Arrival / Completion Deadlines

This milestone adds explicit per-site-visit operational targets to the existing
SVC-005/006/008/009 field visit register. It does not implement contract-level
SLAs, ticket first-response clocks, service-credit clauses, business-hours
calendars, customer escalation or automatic notifications.

## Customer workflow

Services & Orders → Field service site visits: a permitted orders.assign user
may optionally enter the local date/time of the technician's arrival target,
the completion target, or both when creating a new site visit. Values are
converted to canonical UTC ISO and retained as immutable visit targets.
Neither target may predate visit registration, and completion must not precede
arrival. No target is created if both inputs are blank.

A read-only worksheet scores individual arrival and completion targets as
on track, due soon, overdue, met, missed or cancelled. Cancelled visits never
generate false breaches. The warning window is configurable (1h, 2h, 4h, 24h).
The worksheet can be refreshed against the local system clock or exported
as a formula-safe CSV. Missed historical targets remain visible on completed
visits. It does not send automatic messages or change financial data.

## Persistence and access

- SLA is an optional field on the existing ServiceSiteVisit record. Existing
  Windows Offline SQLite snapshot/backup/restore retains it automatically;
  no new table or production migration is required.
- Legacy snapshots without SLA data import unchanged. Malformed UTC values,
  forged snapshot fields, retroactive deadlines and invalid deadline ordering
  are rejected before mutation. Reads return cloned targets.
- Existing reports.view permissions and the currently authorized active branch
  scope all worksheet records. Cloud production remains read-only; visit
  creation is restricted by existing orders.assign/domain controls.
- No paid provider, external API, customer data transmission, financial write,
  stock posting or mandatory infrastructure is introduced.

## Verification / release boundary

Targeted tests: packages/business-logic/src/__tests__/service-visit-sla.test.mjs
and packages/business-logic/src/__tests__/service-site-visit-register.test.mjs.

Require exact-head CI, Web/Desktop build, core coverage, Windows packaging and
installed smoke, feature-click smoke, and post-merge main checks. A source PR
does not constitute a Windows customer installer or accepted Online/Hybrid UAT.
Contract rule management, working-day pausing, event-driven escalations and
cloud-sync authority remain future milestones.
