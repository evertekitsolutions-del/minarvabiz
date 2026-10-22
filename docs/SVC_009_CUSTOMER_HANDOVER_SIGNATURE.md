# SVC-009 — Customer handover signature (Windows Offline)

This cut adds a customer acknowledgement panel directly in the Services & Orders
site-visit register. For **new** visits, the technician first records site arrival
and completes required inspections; customer or representative may then draw a
signature with a mouse, pen or touch and supply a name, after hearing the
acknowledgment notice. Staff must actively check the consent box. The other
allowed outcome is an explicitly recorded reason for declining to sign.
A signature or reasoned refusal must precede new-visit completion.

**Safety/privacy:** This is a manually entered signature and NOT customer
identity verification, a certified statutory e-signature, GPS attendance, proof
of satisfactory repair, warranty waiver or automated communication. The
acknowledgment says that statutory consumer and warranty rights remain intact.
No biometric metadata, timestamps from external clocks, IP/device fingerprint
or background contacts are collected. The signature PNG is retained only inside
the existing Windows SQLite snapshot and backup/restore path (bounded 128 KiB
per image, aggregated with SVC-008 evidence under the existing 32 MiB limit).
The signature or photo bytes are **never placed into visit audit events**.
Do not share unencrypted backups. Get the individual's permission to store
a signature and use retention/deletion controls before real customer rollout.

**Compatibility:** Older visits without a handover key keep existing behavior
and import unchanged. New visits store \`handover: null\` until signed or declined.
Only arrived visits with active branch, live work order, current technician
assignment and \`orders.assign\` permission may add a single handover. Signed,
declined, cancelled and completed events are not editable. All actions
require version compare-and-swap; cloud Production Web stays read-only.

**Acceptance still required:** Installed Windows touchscreen/mouse smoke,
image integrity / backup encryption and restore on another Windows device,
physical consent test, signature retention policy, cloud Online/Hybrid sync
authority, customer UAT and owner-authorized installer publication. No new
production migration, paid provider or customer release is included in this PR.

Verification: targeted service-site-visit register suite, business-logic and
UI typechecks, core coverage, Windows package/deep smoke, feature-click checks,
exact PR-head CI and post-merge CI.
