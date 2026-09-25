# Minarva Biz — Step 25 Clean-Room Final Release Audit

Date: 2026-09-25  
Audited product version: **1.0.4** (historical Step 25 baseline)  
Current commercial release: **1.0.5**  
Pre-Step-25 baseline: `fd24b61` (Step 24)

## Audit method

This audit treats the repository as the source of truth and does not rely on earlier milestone claims. It re-checks release gates, action pinning, governance artifacts, version alignment and source hotspots from the current tree.

The final release baseline is the commit that merges the Step 25 pull request. The release tag must point to that approved merge commit only after its post-merge workflows are green.

## Hotspot profiling

The largest pre-refactor web hotspot was `apps/web/src/lib/data-source.ts` at **1,121 lines / ~58.8 KB**. It mixed Supabase IO/hydration/auth responsibilities with twenty pure row-to-domain mapping functions.

Step 25 extracts those pure mappers into `apps/web/src/lib/data-source-mappers.ts` without changing database IO, hydration ordering, authentication or domain-store behavior. The original data-source module is reduced to approximately **856 lines / 43.4 KB**.

A deterministic hotspot gate now scans JavaScript/TypeScript under `apps`, `packages` and `scripts`, with a release budget of **60,000 bytes or 1,100 lines per source file**. The budget is intentionally above the current legitimate stores/types hotspots while preventing silent growth back into a larger monolith.

## Clean-room release controls

The final audit requires the repository to contain and preserve blocking controls for:

- CI/build and installed Windows runtime verification
- SAST
- dependency/SCA vulnerability auditing
- full Git-history and current-tree secret scanning
- SBOM generation and dependency-license policy
- coverage baseline and changed-code ratchet
- property/fuzz invariants
- tenant/RLS and hybrid-sync integration
- browser/Electron security-negative and recovery E2E
- staging DAST, deployed-header checks and performance baselines
- immutable GitHub Action SHAs and read-only default workflow permissions

The Step 25 workflow independently validates these governance contracts and the hotspot refactor, and type-checks the web application.

## Release interpretation

Passing repository automation means the source/build/package candidate satisfies the automated controls above. It does **not** replace external operational validation.

Before broad customer distribution, retain evidence for the applicable external gates:

- real commercial license activation/deactivation on the intended Windows PC
- restart persistence plus backup/restore drill
- required real printer/thermal-printer output
- production Supabase migration/configuration and representative tenant UAT for online/hybrid deployments
- deployed HTTPS staging/production checks when hosting is available
- Windows Authenticode/code-signing decision and installer hash recording

A failure in any applicable external gate is a release blocker even when repository CI is green.

## Governance outcome

No broad security suppression or workflow bypass is introduced by Step 25. Future runtime changes must follow `docs/GOVERNANCE.md`, use new migrations for deployed database changes, and pass the same release gates before a new release tag is approved.
