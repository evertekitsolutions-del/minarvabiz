# Release readiness — Minarva Biz 1.0.6

## Step 25 final release governance

Minarva Biz 1.0.6 is the current controlled Windows release. The pre-Step-25 repository baseline is `fd24b61`; the authoritative release baseline becomes the Step 25 merge commit after all required post-merge workflows are green.

Do not reuse older freeze SHAs as the delivery baseline. A release tag must point to the approved Step 25-or-later commit and the delivered Windows installer must be preserved with its executable SHA-256.

## Automated release gates

The repository requires the following classes of evidence before controlled release:

- CI, web build/typecheck and installed Windows package/runtime tests
- commercial licensing smoke and installed licensing paths
- Semgrep SAST
- production dependency SCA
- full-history/current-tree Gitleaks scanning
- CycloneDX SBOM and dependency-license policy
- coverage baseline plus changed-code ratchet
- deterministic property/fuzz invariants
- Supabase/RLS tenant-isolation and hybrid-sync integration
- browser and Electron security-negative/recovery E2E
- staging DAST, security-header smoke and performance baselines
- immutable GitHub Action pins, least-privilege workflow permissions
- Step 25 hotspot and clean-room final-release audit

The Step 25 PR and its merge commit are the evidence record for the final repository audit.

## Controlled release

Repository automation does not substitute for environment-specific/customer UAT. Distribution remains controlled until the applicable operational gates are recorded:

- install on the intended Windows/customer test PC
- issue and activate a real commercial test license
- test offline activation, restart/grace behavior, deactivation and PC replacement as applicable
- perform restart persistence and backup/restore
- verify real printer output when required
- verify production Supabase/auth/tenant behavior for online or hybrid deployments
- run deployed HTTPS staging/production security checks when the hosting deployment is available
- decide Windows code signing and record the delivered installer SHA-256

A reproducible failure in an applicable gate reopens release-blocker work. New features do not enter the same release candidate without deliberate version/release planning.

## Database rule

Applied migrations are immutable. Any new schema, RLS or data migration change is delivered as a **new migration** and goes through tenant/RLS integration coverage plus a production rollout/recovery plan.

## Security exception rule

Do not make blocking security gates non-blocking. Any unavoidable security exception must be narrowly scoped, documented with an owner and removal condition, and must not expose secrets or private signing material.

## Release records

See:

- `docs/FINAL_RELEASE_AUDIT.md`
- `docs/GOVERNANCE.md`
- `docs/COMPLIANCE.md`
- `docs/CUSTOMER_DELIVERY_RUNBOOK.md`
