## OFFLINE-NATIVE-03 — Electron primary process ownership fence (source CI pending)

- Verified live main before branch `7411b4b37e529be81d8aea9841d29305d11c463e` (#351 backup/restore IPC gate already merged), main CI 27 pass/7 optional skipped, 0 open PRs; whole Master Vision baseline ~51%, last customer Windows installer v1.0.15.
- `apps/desktop/electron/main.ts` now uses native `app.requestSingleInstanceLock()` before `app.whenReady()` to reject second app processes on the SAME Electron userData profile; second launch focuses/restores owner window, no second-process DB/window/license bootstrap. Fail-closed on denied/errors, keeps existing fsync SQLite writer and same-main IPC backup/restore reservations. Added pure test suite `packages/business-logic/src/__tests__/desktop-single-instance-owner.test.mjs`, docs `docs/WINDOWS_ELECTRON_SINGLE_INSTANCE_FENCE.md`.
- This is real app startup integration, NOT an OS-wide file lock against external SQLite writers or alternate profiles. Pending exact-head and post-merge CI, actual Windows multi-instance/updater/restart stress testing, NTFS crash/low-storage UAT. HR005 live server issuance, authorized device enrollment, atomic accepted-sequence hydration, conflicts/legal rules remain pending. HR005 migration/feature flag OFF, no customer data or paid API usage.

## OFFLINE-NATIVE-02 — SQLite backup/restore same-process IPC fence (source CI pending)

- Continue existing main from `9fedafea7ec79c9600e01f2b4a96ae1de47694e8`, PR #350 exact-head/postmerge green, 0 open PRs. Whole Master Vision ~51%, latest published Windows v1.0.15.
- Root cause: native binary writes are synchronous but async backups/restore validation yield, allowing cross-tab save during snapshot, conflicting backup/restore and false-empty db:readBinary while live file is renamed away. Added `sqlite-ipc-gate.ts` with exclusive reservation spanning async backup and restore; wired directly to existing Electron trusted IPC save/read/exists/manual+automatic backups/restore handlers, with fail-fast false write and retriable busy errors. Tests simulate parallel suspended operations and failure release, and assert actual main IPC wiring.
- **Limits**: same-main-process gate only, NOT OS-wide single instance/process lock, durable cross-process file fence, restored source encryption or HR005 authenticated cloud hydration. Windows NTFS concurrency/power-loss, restore unique filenames/recovery journal, renderer retry UX and genuine customer UAT remain outstanding. No production database/feature migration or paid service. See `docs/WINDOWS_SQLITE_BACKUP_RESTORE_FENCE.md`.

## OFFLINE-NATIVE-01 — Windows SQLite atomic write and fsync hardening (source CI pending)

- Verified main baseline `cae5c1a319663bf890d48e25f5f90a6e84b43da4` (#349 merged), 25 successful and 5 optional skipped main checks, zero open PRs; customer installer v1.0.15, whole Master Vision ~51%.
- Root-cause found in production Electron trusted `db:writeBinary` handler: timestamp-only staging name, temporary file not fsynced before rename, insufficient temp cleanup on error. Shared Offline/Hybrid native durability blocker (more substantive than another HR005 review wrapper).
- Changed existing native IPC to use tested `sqlite-native-atomic-write.ts`: unique exclusive UUID temp, 0600 file, full image write, fsync/close, existing SQLite validation, same-directory atomic rename, best-effort directory sync, before-rename failure preserves last valid file. Business-logic test sweep runs REAL sql.js SQLite valid/invalid roundtrips and fault injections including write/fsync/rename failures and unavailable directory fsync. No new paid services or schema, customer record modifications or HR005 feature rollout.
- WARNING: this alone does NOT resolve native multi-window/restoration race, cross-process single-writer, power-loss NTFS UAT or authenticated HR005 server receipt authorization/hydration. Source tests and green PR+post-merge CI required; no installer release without separate UAT. See `docs/WINDOWS_SQLITE_ATOMIC_WRITE_HARDENING.md`.

## HR-005L immutable SQLite signed receipt staging — source CI pending

- Start from independently verified `main` `13f9dcfa542c149eb126075f0948895b9777cca6` (#348 merged, 25 main CI passed/5 skipped, zero open PRs) and reuse HR005 existing receipt signing/verification. Full Master Vision still ~51%, stable customer Windows v1.0.15.
- This branch adds **source-only, not wired** SQLite verified signed receipt metadata staging: real WebCrypto signature verification precedes SQLite transaction, transaction rechecks max staged sequence, append-only tenant/device-pinned ledger stores only identity, timestamps and SHA-256 fingerprint, never holiday rules. Replays/duplicate UUID, foreign tenant/device and staged rollback refused. It does NOT commit hydrated holiday cache, mark last applied sequence, replay Cloud, overwrite customer SQLite or activate hosted HR005 SQL.
- Real sql.js SQLite file persistence/reopen, real Ed25519 signature, anti-replay, tenant fence, append-only triggers and failed-transaction rollback tests are included in the business-logic CI sweep. Actual native Windows IPC single-writer/atomic durable file commit, server audited issuance and registered device authority, key rotation and customer Offline/Hybrid UAT remain explicit blockers.
- `NEXT_PUBLIC_HR005_HOLIDAYS_READY` OFF and hosted HR005 migration not deployed, no paid service or Windows release. See `docs/HR005_SIGNED_RECEIPT_SQLITE_STAGING.md`.

## HR-005K server-only Ed25519 receipt signing kernel — source CI pending

- Latest verified main before branch: `f94fc98012b0efeeae271d41aea7680d862582fd` (#347 merged), exact-head 19 passed/2 skipped and postmerge 26 passed/6 skipped after retry of a transient Windows pnpm runner failure; zero open PRs. Full Master Vision ~51%; customer installer v1.0.15.
- New isolated `apps/web/src/lib/hr005-holiday-receipt-signing.server.ts` reuses already merged shared canonical snapshot signing bytes and Ed25519 device verifier. Rejects wrong signing key vs pinned public key, malformed tenant snapshot and clock; validates real crypto roundtrip via shared WebCrypto Windows verifier. No env secrets read, API route, payments, production Cloud/SQLite/roster/attendance changes, holiday feature activation, or new dependencies.
- This is a **signing kernel, NOT authenticated issuance**. Required before any production use: independent server session/tenant/device authorization and RLS, device registration/revocation, audited transactional receipt/sequence ledger, key rotation, complete authorized snapshot selection, rate limiting, Windows atomic sync and rollback, Offline/Hybrid cross-device conflicts, statutory policy and real customer UAT. Hosted HR-005 migration NOT applied; flag `NEXT_PUBLIC_HR005_HOLIDAYS_READY` OFF. Details: `docs/HR005_SERVER_SIGNING_KERNEL.md`.

## HR-005J signature-bound Offline intake review — source CI pending

- After PR #343 signed Ed25519 device receipts, PR #345 read-only staff impact and #346 GitHub source agent foundation all merged, verified main `70930867d6e28b8cdf6e9ebd27589f175e23fb41` with 25 successful/5 skipped postmerge checks and zero open PRs. Full Master Vision ~51%; last customer Windows release v1.0.15.
- Reused `verifyHolidayDeviceSnapshot` plus `reviewHolidayRevisionSnapshots` to create a signature-gated, tenant/device/monotonic-sequence-bound read-only Offline intake review. Identifies local/cloud revision divergence, one-sided rules, same-version payload mismatch and missing/empty snapshots without granting deletion or hydration. Explicit `canHydrate: false`.
- Real Ed25519 regression cases cover stale sequence/replay, wrong signer/device/tenant, expiry, local cross-tenant/duplicates/invalid rule, local-newer/cloud-newer/missing/same-version divergence and data immutability; no paid dependency, Cloud calls or customer records changed.
- Source CI and merge remain to verify. Real server signer/enrolled device, durable receipt consumption, atomic Windows apply/rollback, conflict-aware Online/Offline/Hybrid UAT, customer consent and country-specific payroll/leave remain blocked. HR005 hosted migration not applied, `NEXT_PUBLIC_HR005_HOLIDAYS_READY` OFF. Details `docs/HR005_SIGNED_INTAKE_PREFLIGHT.md`.

## HR-005I staff review policy impact — source CI pending

- Start from verified latest main `2bb2218ecb047280607377fec42cc2adbe66ce98` (PR #342 merged, exact-head 19 passed/2 skipped and post-merge main 25 passed/5 skipped; zero failures or pending, no open PRs).
- Reuse existing authenticated manager-only Cloud/local holiday revision and civil-day impact comparisons. Add a shared bounded read-only delta of roster/attendance **review findings** in the selected tenant/country/branch/window; context changes reset previews. No automatic writes, device sync, server authority, holiday or payroll decisions.
- Actual production read-only Supabase project inspection on 2026-10-11 confirmed `staff_holiday_rules` table and HR-005 migration are not deployed. Keep `NEXT_PUBLIC_HR005_HOLIDAYS_READY` OFF until explicit authorization and proper UAT.
- Source milestone requires exact-head/post-merge CI and real authorized Web/Windows acceptance. No new paid dependency, migration, company data edit, production feature activation or release. Full Master Vision ~51%; customer installer v1.0.15. Details: `docs/HR005_STAFF_IMPACT_REVIEW.md`.

## HR-005 signed device holiday receipt verifier — source CI pending

- Baseline main `2bb2218ecb047280607377fec42cc2adbe66ce98` after PR #342 merged; 25 successful / 5 skipped post-merge checks, zero open PR at branch creation. Latest stable customer Windows installer v1.0.15; full Master Vision ~51%.
- Added standalone Ed25519 WebCrypto verification of tenant/device-pinned, expiry-bounded, monotonic-sequence signed holiday snapshots. Source only: consumes pinned trusted verifier key, rejects tampering, cross-org data, replay, bad identities, invalid records. It NEVER hydrates SQLite cache or authorizes any Cloud/attendance/payroll/roster write.
- Tests cover real Ed25519 signatures plus negative tamper, replay, expired, wrong signer/tenant/device, input immutability and no-write guard. No paid services or new runtime dependencies.
- Still missing: authenticated server signing/audit/device registration, protected last-sequence state, durable receipt authority, atomic Windows hydration/rollback, genuine customer Web/Windows/Hybrid UAT, unapplied HR-005 production migration, OFF `NEXT_PUBLIC_HR005_HOLIDAYS_READY` flag and reviewed leave/payroll policy.
- See `docs/HR005_SIGNED_DEVICE_RECEIPT.md`; exact-head/post-merge CI acceptance follows live GitHub results, not this preliminary wording.

## HR-005 effective calendar day impact — source CI pending

- From verified main `b0177f0e5146e9f2928614a61da2c2c5310fa7db` (PR #341 merged; 25 checks passed, 5 skipped; zero failed/pending; open PRs 0 before branch), the new bounded review reuses authenticated HR-005 Cloud rule list, offline v15 snapshot validation and deterministic branch-local shared calendar engine.
- Existing manager Web comparison gains optional scoped From/To (at most 366 days) **effective holiday day impact** alongside exact rule-revision findings. Tenant mismatches, malformed snapshots, duplicates, invalid dates and stale selected context fail closed; changing context clears old findings. No automatic write, receipt, hydration, roster, attendance or payroll decisions.
- Source-only: exact-head/post-merge CI and real customer UAT still required. HR-005 production SQL migration has NOT been authorized or applied; `NEXT_PUBLIC_HR005_HOLIDAYS_READY` remains OFF. Tenant/device authoritative Cloud-to-Windows hydration, audited receipts, Offline/Hybrid conflict reconciliation and statutory policy remain pending. Stable customer installer v1.0.15; Full Master Vision ~51%.
- See `docs/HR005_EFFECTIVE_CALENDAR_IMPACT_REVIEW.md`.

## HR-005 Windows offline read-only holiday review — branch pending CI

Current pre-branch verified main `6259be8425a5be0d82a03d652e737b0aae61461e`; PR #340 exact-head/post-merge checks green. Reuse Windows SQLite v15 read-only holiday cache and shared calendar/roster/attendance preview. Add manager-only display inside existing Windows Roster Planner. No active Cloud holiday migration, replay, automatic edits, paid providers, or new stable installer. Full Master Vision ~51% until customer acceptance; verify CI and then real installed Windows/Cloud policy authority. See `docs/HR005_DESKTOP_OFFLINE_HOLIDAY_REVIEW.md`.

## HR-005 read-only offline/cloud revision preview — branch exact-head CI pending

Main pre-branch `4f795b0bbcbfd8e863fcdd332c07b64014e7d17c`, PR #339 verified 25/5 post-merge checks. Compare current authorized manager Cloud holiday list to read-only Windows/device cache for version/content/missing-item mismatches without automatic sync, deletion or Cloud update. No new provider, production migration or customer release. Do not mark HR-005 complete; full Master Vision ~51%, stable installer v1.0.15. Refer to `docs/HR005_CLOUD_OFFLINE_REVISION_REVIEW.md`.

## HR-005 Cloud-only continuation and attendance exception review — source verification pending

- GitHub main baseline after PR #338: `11ac47b8f6e03de503365f1f112a2a96a520be59`; 25 successful checks, 5 optional skipped, no failed/pending and zero open PRs before new work. The user's local OpenCode/Ollama path is optional and not part of delivery.
- Independent HR-005 read-only attendance/holiday discrepancy review adds a shared pure function and gated Web roster preview. No automatic attendance/roster/payroll decisions, production migrations, new packages, paid AI or Cloud account setup. Online authorization and tenant scope remain enforced by existing components.
- Run exact-head and post-merge checks before checkpoint acceptance. Real customer acceptance, SQLite/Hybrid sync/write authority and production holiday rollout remain separately blocked. Master Vision ~51%.

## HR-005 Web holiday integration checkpoint — pending exact-head source verification

PR #335 and #336 are merged (source baseline `571c0117a8134ab45519baa5ed030082eaae9655`). New Web console adds feature-flagged authenticated holiday manager, scoped save/list, optimistic revision, read-only roster exception preview. Production holiday SQL migration **not** applied; customer UAT and Windows Offline/Hybrid parity missing. Keep `NEXT_PUBLIC_HR005_HOLIDAYS_READY` OFF until controlled database rollout. Live source CI/results supersede this provisional checkpoint. Full Master Vision ~51%.

# Minarva Biz — Durable Development Continuity

**Purpose:** A GitHub-backed recovery/checkpoint mechanism for chat interruptions, not a replacement for human or AI implementation.

## Single source of truth and what persists

- `PROJECT_CONTINUATION.md`: verified project history, source versus production deployment boundaries.
- `docs/DEVELOPMENT_TASK_QUEUE.json`: ordered task IDs, status, next work, minimum feature acceptance and references. Only change a task to `verified` after required tests, release/product acceptance and documented evidence. A PR or green CI alone does not prove full Master Vision completion.
- `Minarva Biz — Development Continuity Dashboard` GitHub Issue: machine-updated snapshots of current main SHA, open PR numbers, observed latest-main checks, latest GitHub release tag, next unblocked task and all queued tasks.
- `.github/workflows/automated-ci-triage.yml`: existing failed PR issue reporter retained; the new protected `continuity` job fetches **data only** from GitHub. It never checks out/executes PR code with the write-scoped token.

## Operation

After completion of an eligible main push CI/Windows check, or the daily no-new-commits safety refresh, the continuity job updates the **same** GitHub Issue. Concurrency is serialized for main so overlapping workflow completions do not create duplicate issues. A manually closed dashboard is respected and not reopened or silently duplicated. Failures in the read/API path fail visibly and can be retried on the next eligible main CI/refresh; the previous checkpoint remains.

On chat interruption:

1. Verify live `main`, open PRs/issues and all exact-head/required checks, not the SHA from the chat.
2. Read `PROJECT_CONTINUATION.md`, `docs/MASTER_PRODUCT_PLAN.md`, `docs/CAPABILITY_REGISTRY.md`, `docs/AI_CAPABILITY_REGISTRY.md`, `docs/ENGINEERING_REUSE_POLICY.md`, `docs/MULTI_MODEL_REVIEW_GOVERNANCE.md` and this queue file.
3. Finish any open feature PR first: inspect failed logs, fix the root cause, rerun checks, merge only when required gates are green, then verify post-merge.
4. Do not edit live migrations, invoke external AI, choose paid services or issue customer approvals automatically. Keep branch/tenant, Offline/Online/Hybrid, history, security, audit, compatibility and genuine customer UAT gates in place.
5. Only mark a feature `verified` and update the **whole-product progress estimate** after recorded acceptance evidence. Feature slices and passing smoke tests do not warrant fabricated increases.
6. Search current Minarva code and license-compatible mature OSS before writing substantial custom code.

## Security and cost model

The workflow has existing read permissions plus `issues:write`; it cannot write source code or deployment secrets. GitHub's built-in token is ephemeral. Dashboard content is **public** because the source repository is public; never place credentials, customer data or private incident logs in queue text or issue comments. No external model/API or paid dependency has been added.

GitHub Actions execution still consumes any applicable GitHub runner quota. The daily refresh is low-frequency, not an unlimited-work guarantee. There is **no autonomous coding model installed**: without an independently running authorized agent, no new feature implementation happens while ChatGPT is disconnected. The dashboard preserves the next work and failure status so the next session can resume without recreating the plan.

## Acceptance evidence

`node scripts/development-continuity-contract-smoke.mjs` verifies task IDs, priorities and acceptance references; privileged-workflow branch/repository guards; no checkout or automation of merges; bash syntax; create/update of a single dashboard issue; failed main check surfacing; respect of a human-closed issue. This regression runs in existing main/PR CI. Existing Web, Windows, security, supply-chain and licensing checks remain mandatory.

The newest verified source milestone is PR #333, same-origin Web Locks for explicit local-only reviewed restore, merged at `a33c934fa018a81beef0f6a2b604dbe83d40ed2c` with 25 passed / 5 optional skipped / 0 failed or pending main checks. Earlier PR #332 added human-only deterministic HR-004B multi-ID review ordering. HR-004C policy lifecycle PR #326 and its production migration were previously verified, but flag rollout and authenticated UAT remain pending. Neither milestone shipped a newer customer installer or completed HR recovery/scheduling. Full Master Vision estimate remains approximately **51%**. Read the live task queue for acceptance blockers.
