# Minarva Biz — Engineering and Release Governance

This document defines the repository rules that apply after the Step 25 final release audit.

## Change governance

- Protect `main` as the release integration branch. Runtime changes should arrive through a reviewed pull request with reproducible scope and test evidence.
- Keep changes small and independently verifiable. Security, schema, licensing and release changes must state their risk and rollback path.
- Automated or AI-assisted changes are held to the same build, test, security and review gates as manually written changes.
- Do not weaken a blocking workflow to make a change pass. Fix the finding or document a narrowly scoped, reviewable exception.

## Database and migration governance

- Existing Supabase migration files are immutable historical records once applied.
- Every schema or RLS change must be a **new migration** with a new filename; never edit an old production migration to change deployed behavior.
- Tenant-isolation and RLS changes require integration coverage before merge.
- Production migration rollout requires a backup/recovery plan and an identified rollback or forward-fix procedure.

## Security governance

- SAST, dependency SCA, full-history secret scanning, SBOM/license policy, coverage, tenant/RLS integration, browser/Electron security E2E, and staging DAST are release gates.
- GitHub Actions must use immutable commit SHAs and least-privilege token permissions.
- A security exception must identify the exact finding, owner, reason, scope and removal condition. Broad path/rule suppressions are not acceptable when a fingerprint or narrower exception is possible.
- Secrets and private signing material stay outside Git. Suspected exposure requires credential rotation, incident review and history scanning.
- Dependency vulnerabilities at the configured blocking severity are fixed before release rather than ignored.

## Release governance

- Product version changes are intentional and synchronized with the Windows desktop release version.
- A release tag must point to the approved Step 25-or-later release commit after required post-merge workflows are green.
- Preserve the delivered installer outside temporary CI artifact retention and record its executable SHA-256 for customer delivery.
- Windows code signing, production deployment configuration, production database rollout and physical hardware UAT remain operational release controls.
- Release notes must distinguish repository automation evidence from external/customer UAT evidence.

## Rollout and rollback

- Back up customer data before any migration or upgrade that can affect persistence.
- Stage production-impacting changes before broad rollout.
- If a release blocker is found, stop distribution, preserve diagnostics, identify the last known-good release tag and use the documented recovery/forward-fix path.
- Database rollback must never discard customer data; prefer compatible forward fixes when destructive rollback is unsafe.

## Operational ownership

- Security findings, dependency alerts, failed release gates and customer data incidents require an explicit owner before closure.
- Re-run the relevant security/release workflows after corrective changes.
- Update `docs/RELEASE.md` and the final audit record when a new release baseline supersedes this one.
