# SVC-008 — Windows Offline site photo/document evidence

## Customer workflow
In **Services & Orders → Field service site visits**, schedule and mark an assigned
technician's visit as *Arrived*. Open **Photo / document evidence**, select
*Before*, *After*, *Diagnostic* or *Document*, add optional notes, and pick an
actual JPG/JPEG, PNG, WebP or PDF. The app stores the file bytes in that visit's
existing Windows Offline SQLite domain snapshot. Staff can download copies.
While the visit is Arrived, a mistaken attachment may be removed only with a
recorded reason; completed/cancelled visit evidence is immutable.

This is real binary content (base64 in existing snapshot), **not only a
filename/link metadata entry**. Legacy backups without the optional
\`evidence\` collection still import. Domain snapshot validation checks each
attachment and rejects corrupted/maliciously shaped input before hydration.
The new implementation does not modify finance/stock/ordering or send
customer notifications.

## Constraints
- **2 MiB per attachment**, **6 attachments per visit**, and **32 MiB evidence
  total** across the Windows snapshot; the UI shows a clear rejection if
  exceeded. Large original camera photos must be compressed externally.
- Accept MIME/filename pairs for \`image/jpeg\`, \`image/png\`, \`image/webp\`
  and \`application/pdf\`; check canonical base64, actual decoded byte count
  and recognizable file header. SVG/HTML/executable content is not allowed.
  Checks are not full malware scanning or forensic proof of authenticity.
  PDF files are **downloaded explicitly**, never embedded in an iframe.
- Active branch and order/assignment verification; \`orders.assign\` for
  writes, \`reports.view\` for branch-scoped display/download. Existing
  visit revision CAS prevents stale or duplicate writes. Changes are audited
  using metadata only; raw base64 payload is intentionally excluded from
  action logs.
- Attachments may contain sensitive people/site details and original photo
  EXIF/GPS metadata. Staff must obtain any necessary customer permission.
  They remain in the installed Windows app and its backups; there is no
  automatic network upload, removal from already-created backups, cloud
  synchronization, technician mobile app, encryption-at-rest upgrade or
  externally certified signature in this milestone.

## Validation and release
Regression suite:
\`node --test packages/business-logic/src/__tests__/service-site-visit-register.test.mjs\`
(tests bytes, file type spoofing, snapshots, CAS, audit payload isolation,
legacy import and role/tenant/production restrictions).
Exact PR-head GitHub CI including core coverage, Web/Desktop builds,
Windows smoke and feature-click tests is required. After merge, verify
post-merge main checks. Licensed Windows device/customer UAT and an
explicitly approved Windows installer release remain separate requirements.
No production migration, new paid service or release is included.

Rollback: revert source PR; historic SVC-005/SVC-006 rows and existing
snapshot structure remain supported. If attachments have been saved,
export and retain a verified backup before reverting to a version that
does not understand evidence to avoid silent loss on future re-saves.
