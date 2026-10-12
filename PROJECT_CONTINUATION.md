## OFFLINE-NATIVE-06 — External SQLite image mutation detection (source PR verification pending)

- Baseline verified live main `6767171fe9cad42f5a1eee576c1aa6b7ac467f17` (PR #354 merged; post-merge checks 25 passed/5 optional skipped, 0 failed/pending; zero open PRs). Full Master Vision ~51%; published installer v1.0.15.
- New SHA-256 optimistic native SQLite image fingerprint detects changes to a previously read customer database (including same-length/stale-mtime changes and external create/delete), denies stale full-image saves, rechecks immediately before atomic rename, advances only after successful save, and blocks old-renderer reads and writes after validated restore until process restart. Electron db:readBinary no longer converts EACCES/EIO into an empty new DB. Real SQL.js cases, staging race fault injection and trusted IPC assertions added.
- This is NOT cross-process OS locking and does NOT close the last comparison-to-rename race; real NTFS concurrent external writer, backup/restore cross-process, disk/antivirus failure, updater and installed customer UAT remain pending. No HR005 migration/flag or actual customer data change. See `docs/WINDOWS_SQLITE_EXTERNAL_IMAGE_FENCE.md`. Verify PR exact-head/postmerge CI independently.

## OFFLINE-NATIVE-05 — Journalled Windows SQLite restore and fail-closed startup recovery (PR #354 CI pending)

- Baseline verified main before branch: `be5602816a0221511087741bc860b3811a01b9e4`, 25 passes/5 optional skips, 0 open PRs. Full Master Vision ~51%; stable customer installer remains v1.0.15.
- PR #354 introduces an fsynced same-volume versioned restore journal before the first live DB rename, pre-renderer inspection and verified rollback if the live DB is missing. Surviving valid DBs are never overwritten; orphan/malformed/multiple workspaces or corrupt images block startup without deleting customer data. Pending evidence also fences repeat restore. Failed first-time restores no longer leave an invalid new live image.
- Real-path helper crash-window tests and production static wiring assertions included; exact-head and post-merge GitHub CI, NTFS sudden-failure, disk/antivirus/updater and installed Windows customer UAT remain required. No production migrations, HR005 enablement, customer writes, paid services or Windows release. See `docs/WINDOWS_SQLITE_RESTORE_RECOVERY_JOURNAL.md`.

## OFFLINE-NATIVE-04 — Exclusive, fsynced restore staging (source verification pending)

- Baseline main `e97c675ce79a8e2ef9a1ec67cd4b5f34fcc2cb47`, 25 successful/5 optional skipped checks, 0 failures/pending; 0 open PRs. Existing #350–#352 protections preserved.
- Restore now reserves a unique same-volume workspace, copies exclusively, fsyncs/closes before validation or moving live data, and cleans without deleting stranded rollback images. Real SQLite reopen and IO-fault regressions added. See `docs/WINDOWS_SQLITE_RESTORE_STAGING.md`.
- Still pending: durable restore journal/startup recovery, native external-writer locking, actual Windows NTFS shutdown/low-disk/antivirus and updater UAT, HR005 authorized synchronization. No production migration/flags/customer data/installer changes. Full Master Vision ~51%, latest stable v1.0.15. PR and post-merge results must be independently checked.

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

## HR-005 Windows SQLite calendar review UI — source CI pending

- Verified live main before branch: `6259be8425a5be0d82a03d652e737b0aae61461e` (PR #340 merged, post-merge 25 passed/5 skipped and 0 failed/pending, 0 open PR); Full Master Vision ~51%, customer Windows installer still v1.0.15.
- Reuses `holidayCache.listHolidayCache` native SQLite v15 snapshot, permission-checked staff/branch readers and shared deterministic calendar, roster/attendance exception engines. Windows Roster Planner gets a manager-only **read-only local snapshot review** with explicit country/branch/date context and stale-data warnings, no Cloud authorization claim. Tests exercise RBAC, branch/tenant isolation, conflicting policies, leap days, no mutations and desktop navigation.
- No extra dependencies, paid AI, migrations, feature activation, Cloud writes, attendance/payroll edits, or automatic sync. Remaining: exact-head/post-merge CI, real installed Windows customer UAT, server-audited tenant-bound Cloud hydration and Offline/Hybrid write/sync, deployed holiday migration with explicit customer approval and country/payroll legal rules.

## HR-005 Offline/Cloud revision conflict review — source CI pending

- Latest verified live main before this branch: `4f795b0bbcbfd8e863fcdd332c07b64014e7d17c` (PR #339 merged, 25 passed/5 skipped exact-head main checks, zero open PRs); Full Master Vision remains ~51%; stable released Windows installer remains v1.0.15.
- Reuse `holidayCache.validateHolidayCache`, `holidayCalendar.HolidayRule`, `onlineHolidayManager().list()` and feature-flagged holiday Web UI. Only a current authenticated organization manager can request fresh Cloud data, checked against local tenant scope before pure comparison. Classify identical, Cloud-newer, local-newer, equal-version divergence and Cloud-only/local-only as **human/server review**, NOT automatic deletion or sync authorization.
- Source-only, no new dependency, paid LLM, Cloud infrastructure, production migrations, online/offline writes, automatic roster/attendance/payroll change, release or actual customer UAT. GitHub Actions and the existing hourly ChatGPT task remain separate: CI is not an autonomous AI coding system.
- Verify exact-head/post-merge CI. Still pending: authenticated customer UAT, true device/outbox receipt and transaction authority, Windows Offline/Hybrid sync conflict resolution, HR-004B/004C acceptance and legal holiday/payroll policy.

## HR-005 configurable holiday vs attendance read-only review — source PR pending

- Verified live main `11ac47b8f6e03de503365f1f112a2a96a520be59` (source PR #338 merged, 25 passed/5 skipped/0 failed main checks), zero open PRs before this branch. GitHub remains the connected cloud coding/CI infrastructure; no paid AI, local Ollama, new cloud account or background coding service is required.
- Reuses merged HR-005 shared Gregorian date/tenant/country/branch review, existing authorized attendance reader and gated Web Holiday Console. Shows explicit reviewed nonworking-day attendance, contradictory holiday rules, manually recorded 'holiday' with no configured nonworking rule, and missing branch scope. The last condition remains unverified rather than assuming another branch's policy.
- Deterministic bounded pure preview; rejects invalid staff/date/duplicate staff/day, refuses other-branch and inactive/foreign tenant rule matches, never mutates attendance, holiday rules, outbox, audit, payroll or Cloud records. No new dependency, migration, paid service, production feature flag change or new installer.
- **Pending:** PR exact-head, post-merge CI and actual authenticated Browser/Windows/Offline/Hybrid UAT. Production holiday SQL migration remains unapplied; `NEXT_PUBLIC_HR005_HOLIDAYS_READY` stays OFF. Full Master Vision stays approximately **51%**.

## HR-005 parallel calendar implementation — authenticated Web console source pending CI

- Verified main after PR #336: `571c0117a8134ab45519baa5ed030082eaae9655`; PR #335 introduced shared deterministic read-only holiday calendar preview (Web/Windows compatible), PR #336 introduced audited, revisioned, tenant-RLS PostgreSQL calendar rules and migration replay evidence. PR #336 **did not deploy to hosted production**.
- New Web console source milestone offers authorized manager-scoped holiday list/create/review/change/deactivation, explicit ISO country/branch/org scopes, calendar/roster read-only exception preview, no automatic payroll, attendance or roster writes; reuse existing `holidayCalendar` namespace.
- Online access must use active session-generation checks, `current_user_authorization` RPC, PostgREST RLS list and audited `save_staff_holiday_rule` RPC. Feature flag `NEXT_PUBLIC_HR005_HOLIDAYS_READY` defaults OFF until independent migration/UAT acceptance. Unknown/stale writes block further edits pending fresh authorized reload.
- This Web capability **does not claim Offline SQLite/Hybrid parity** or statutory pay settings. Required follow-on: rollout gate verification, real authenticated manager/cashier/tenant browser UAT, shared Windows SQLite holiday data persistence/backup/sync with optimistic conflicts, audit compliance, attendance/roster/payroll policy acceptance.
- Full Master Vision remains approximately **51%** pending end-to-end product evidence; latest confirmed stable customer installer **v1.0.15**.

## HR-004B checkpoint / local restore cross-tab exclusion — source CI pending

- Main after PR #333: `a33c934fa018a81beef0f6a2b604dbe83d40ed2c`; independently checked main CI 25 passed / 5 skipped / 0 failed/pending. The reviewed single-event and same-ID-chain local restoration actions are protected by native Web Locks.
- This next narrow source change reuses **the exact same browser lock** to serialize pre-RPC encrypted checkpoint read/compare/CAS persistence with local restoration, so a tab cannot change the sealed source during another tab's fresh review and hydration. A contending tab or missing Web Locks fails before any outbound roster RPC, without discarding the backup.
- Existing tenant authorization, original event identity, no auto-replay, and IndexedDB atomic revision CAS remain intact. Tests add tab contention, unsupported API and no-vault-write assertions. No new dependency, production schema migration, cross-device claim or multi-ID recovery authorization.
- Pending: exact-head PR CI, post-merge CI, Chrome multi-tab UAT, Windows/Offline/Hybrid parity, browser eviction/crash recovery, server-audited transaction conflicts, and authorized customer acceptance. Full Master Vision ~51%; stable installer v1.0.15.

## HR-004B same-origin concurrent restore exclusion — merged PR #333 and green main

- From verified main `f4e122fb0ce451b5998e32d69e7fd6b8e507e68e` (PR #332 merged; exact-head 25 passed/5 optional skipped), branch `feat/hr004b-cross-tab-reviewed-restore-lock` adds native Web Locks exclusive/ifAvailable protection around both existing explicit **local-only** reviewed single-event and same-ID-chain restore flows, including fresh scoped Cloud/vault reads and memory/outbox hydration.
- A busy other browser tab or unavailable Web Locks fails closed without replay, destructive vault mutation or Cloud writes. Existing IndexedDB CAS remains unchanged. No third-party package, paid service, production migration, customer approval, multi-ID recovery permission or new UI restore path.
- Node regression covers contention, unsupported API and error release alongside existing reviewed-restore tests. **Before acceptance:** verify PR exact-head and post-merge CI; real multi-tab Chrome/Windows UAT, cross-device and server-audited transactions/rollback, revoked sessions, eviction recovery and Offline/Hybrid parity remain pending. A browser lock is **not** cross-device or authoritative Cloud conflict resolution.
- Full Master Vision remains **~51%**; latest customer installer `v1.0.15` unchanged.

## HR-004B isolated restore safety correction — PR #330 rebased on merged #331
- Match the canonical same-day RLS Cloud peer on both isolated roster button and restore authority; refuse missing/stale/foreign/different-ID peers. Existing ordered chain remains intact. Local-only; no automatic Cloud write.
- Verify exact-head/post-merge CI. Actual customer UAT, cross-device and Windows/Hybrid parity remain open; whole Master Vision ~51%.

# Minarva Biz — Authoritative Project Continuation

**Last updated:** 2026-10-11  
**Repository:** `evertekitsolutions-del/minarvabiz`

This file is the first document a new ChatGPT/work session should read after verifying live GitHub state.

## Current HR-004B distinct-ID read-only ordering source (PR verification pending)

- Live main before branch: `109e8ea58939e79211c49b31fdcc627ea7a15bcc`; PR #330 merged, post-merge exact-head 25 passed / 5 skipped / 0 failed or pending, zero open PR.
- Branch `feat/hr004b-multiid-ordered-readonly-plan` reuses encrypted tenant-scoped comparisons and device/sequence metadata to display a deterministic proposed **human review order** for 2–25 distinct canonical record updates only; checks partial history, device sequence gaps, cross-device ambiguity, duplicate record IDs, shift prerequisites, historical timing safety, staff/date conflict and RLS-visible same-day peers. Explicit automatic recovery permission is **always false**.
- Web shows ordered preview or fail-closed quarantine reason; no new mutation buttons, DB migration, AI billing, remote API, storage, auto-replay or authorization escalation.
- CI must verify new `roster-recovery-multiid-plan.test.mjs` and existing security/Web/Windows gates before merge. Ordered multi-ID **recovery** itself remains blocked pending audited server transaction, true cross-device conflict authority, atomic rollback, customer UAT and Offline/SQLite/Hybrid parity. Existing single-event and same-ID chain restore remain unchanged.
- Full Master Vision estimate stays **~51%**, latest customer Windows stable installer `v1.0.15`.


## Current HR-004B reviewed consecutive same-ID local recovery — source CI pending

- Verified live main `81d1c8de5047a623ac7fe4b44cd5d8a919ec1d6f`, 25 successful / 5 skipped / 0 failed checks and zero open PRs. Branch `feat/hr004b-reviewed-same-id-chain-restore` continues after merged PR #328/#329; **does not restart** existing work.
- Adds an explicit administrator-confirmed **local-only** reconstruction of a complete 2–25-event same-canonical-record update chain, from one device, with strictly ascending device sequence, consecutive optimistic versions, identical authorized Cloud baseline and matching sealed original events. Cloud same-staff/day peers must be unambiguous for roster slots. All changed revisions and dependent historical shift rules are validated. Uses existing domain `hydratePhase6` transactional rollback and `hydrateOutbox`, preserves encrypted originals and event identities.
- Two fresh tenant-scoped reads, current-session/writer-generation checks, zero automatic network write or acknowledgement, strict rejection on mixed/cross-device/nonconsecutive/different-ID chains. Original encrypted vault is never deleted; explicit Retry and Cloud's audited event RPC remain separate.
- Added Web UI guarded action and Node synthetic recovery tests. **Pending:** PR exact-head CI, post-merge CI, real authenticated customer browser UAT, Cloud race/cross-device proof, Windows SQLite/Offline/Hybrid parity, audited multi-ID dependency-order recovery. Do not claim full HR-004B complete. Full Master Vision stays ~51%; Windows stable release v1.0.15 unchanged.

## Current HR-004B Cloud same-day peer review — source PR pending

- Verified pre-branch main `aa8c0fb90a57373df42e672e31912ae552bc963e`; 25 passed / 5 optional skipped, no failures/pending, no open PR. PR #328's bounded encrypted multi-event dependency inspector and tests merged; its server-visible external same-day peers remained missing.
- Branch `feat/hr004b-cloud-day-peers` **reuses existing** manager SELECT RLS on `staff_roster_slots`, the current session-pinned RemoteWriter, and staff/date index; adds a strictly bounded, read-only tenant-scoped day lookup (26 fetch limit, reject >25), staff/date/id validation and warning of Cloud-visible different-ID records outside the encrypted local batch. No migration or additional privilege grant.
- A RLS-hidden row can still be invisible; independent reads can race with concurrent Cloud writes. Hence an unavailable/ambiguous peer snapshot explicitly remains **UNVERIFIED**, and the user must not treat an empty response as permission to overwrite. Existing single-event reviewed local restore gate is unchanged; all multi-event writes remain prohibited.
- No customer UAT, Offline/Windows/Hybrid proof, actual ordered multi-event restore, or version-safe reconciliation has been delivered. New tests cover constrained RLS queries, field validation, cross-scope rejection and different-ID warnings. Run exact-head and post-merge CI before accepting source. Full Master Vision estimate stays **~51%**.

## Current HR-004B source slice — pending independent CI

- Started from verified main `b4812336ad43097d5b8f8988a3f7b9b5c1b0547d`; 25 successful / 5 skipped / 0 failed checks, no open PR.
- Branch `feat/hr004b-multievent-readonly-dependencies` adds deterministic, bounded, **read-only** review of sealed dependent events, same canonical record chains and different-ID same-staff/day candidate collisions, with strict preservation of existing one-isolated-event restore and encrypted vault protections. Existing code was reused; no new runtime dependency, paid service, migration or customer data operation.
- All batch recovery mutations **remain blocked**. Server-side authoritative different-ID conflict reconciliation, reviewed ordered restore/retry, durable rollback on browser eviction, real browser-profile UAT and Windows/offline/hybrid parity remain required.
- New tests live in `packages/business-logic/src/__tests__/roster-recovery-dependencies.test.mjs`. Merge only after exact-head CI, independent review and post-merge CI. Full Master Vision remains ~51%.

## Latest verified HR-004C source and database checkpoint — Oct 11, 2026

- PR #326 merged into main `0a98f29b7e2c8c633b82de7835f1b990afaa41ba`. Exact-head PR: 20 successful, 2 skipped, 0 failed. Post-merge main: **25 passed, 5 optional skipped, 0 failed/pending**, no open PR. Stable public Windows installer remains **v1.0.15** (do not equate source runner release with installer).
- Supabase `wmjgefbaliuwmaxyzxkq` is healthy. Verified migration history has `20261011054317 hr_roster_policy_resolution_selection`; the additive migration was **already applied**, so it was not reapplied in the follow-up. RLS + FORCE RLS active on resolution/review ledgers; authenticated role SELECT allowed but direct INSERT/UPDATE/DELETE denied; append-only and insertion-validation triggers present; resolution/selector RPCs allow authenticated EXECUTE with server membership/role validation, deny anon. Production tenants/drafts/reviews: zero during verification.
- Scheduling guard still does NOT call policy candidate selection. Web lifecycle actions are deployment-flagged OFF by default pending authenticated administrator rollout and browser UAT; existing review interface still works before lifecycle flag enablement.
- Task queue HR-004C remains **in progress**, not whole feature verified. Remaining acceptance: verify deployed flag and authorized real browser interaction, Windows/Offline/Hybrid parity, history/DST/branch migration safety, future independent server UTC/rest enforcement cutover and genuine customer UAT. No extra paid infrastructure.
- Optional free local Ollama + OpenCode developer workflow documented in `docs/LOCAL_OLLAMA_AGENT_WORKFLOW.md`: agent work requires a running PC and an explicit authorized branch; no autonomous paid service, no direct production secrets, and no skipping PR/CI gates. Keep durable Issue #325 updated through normal main workflows.
- Full Master Vision estimate remains **~51%**. Do not add 1% for a PR, migration or documentation alone.


## Current source work — HR-004C review lifecycle (PR verification pending)

- Verified live main baseline `e7a0e5ac83519b4478f4982310f694d886f1bd39`, 0 PRs and one open checkpoint issue #325; 25 visible passed checks, 5 optional skips, no failures before branch.
- Branch `feat/hr004c-reviewed-policy-lifecycle`: additive PostgreSQL resolution ledger and authorized immutable revocation/cancellation of inactive reviewed approvals; date-scoped read-only candidate selector; amended review overlap rule excludes explicitly resolved or superseded historical approvals. Preserves all old reviews, strict tenant/RBAC/RLS, audit and branch locks; **does not activate scheduling enforcement**.
- Real ephemeral PostgreSQL 17 E2E and static contract added to CI, with cross-tenant/manager/cashier, stale/duplicate, overlap, period, rollback and immutable history checks. These source changes are not accepted until PR exact-head and post-merge checks pass.
- Web administrator resolution/preview source and Chrome tests are included behind deployment flag NEXT_PUBLIC_ROSTER_POLICY_LIFECYCLE_READY=true, OFF by default. Existing draft/review UI remains available before migration rollout. Remaining: verified production SQL, flag activation, authenticated customer UAT, UTC/rest guard cutover, Online/Offline/Hybrid parity and Windows customer release. No paid services, no claim of completion above ~51%.

## Active delivery: GitHub-based durable development continuity (source PR pending)

- Live baseline before branch: main `916cdd4c1cf1ea799bb1f46a14ff5fc789e8bbde`; 0 open PRs/issues, PR #323 shared Web/Windows monthly roster calendar merged; post-merge main exact-head 21 successful checks, 5 optional skipped and 0 failed/pending. Latest public stable Windows release separately verified as v1.0.15.
- New branch `feat/durable-development-continuity-dashboard`: preserves task IDs, ranked full-scope backlog, acceptance and next actions in `docs/DEVELOPMENT_TASK_QUEUE.json`. Extends the existing no-checkout `.github/workflows/automated-ci-triage.yml` so completed main CI/Windows check runs or a daily backup refresh update ONE durable GitHub Issue; PR failures still create the existing triage issues. This prevents loss of handoff state when ChatGPT networking or usage stops.
- CI runs `scripts/development-continuity-contract-smoke.mjs` with synthetic GitHub API and duplicate/closure regression. New dashboard uses only GitHub's built-in token, issues:write permission and no untrusted code checkout; no external paid AI provider. See `docs/DEVELOPMENT_CONTINUITY.md`.
- **Not autonomous coding:** no claim that GitHub can develop new features while no coding agent runs. The checkpoint and CI are durable, but a separate authorized developer/agent still must implement and verify new PRs. No automatic merge, production SQL mutation, releases or cloud credential changes.
- Current planned next accepted feature scope (subject to live status): HR-004C immutable policy revocation/effective selection, HR-004B multi-event recovery, then controlled server UTC/rest cutover and recurring approvals; reuse Minarva/shared and permissively licensed source first. Do NOT repeat #314–#323 or declare scheduling complete.
- Full Master Vision remains estimated **~51%**, not a CI or partial HR milestone percentage. No feature scope reduction, paid options, fictional UAT or new Windows customer installer.


## Active reuse-first feature — HR-004 Web/Windows monthly calendar (CI pending)

- Baseline verified at start: `main` `b82256a3bb9fb44dba60970a26ec77a9e9b0522d`, 0 open PRs/issues, 21 success/5 skip/0 failure checks.
- Branch: `feat/hr004-roster-month-calendar-reuse`. Adds a genuine read-only month calendar via existing `workforceRoster.rosterRange` + shared `RosterPlanner` in Web/Windows, reusing existing staff/shift/branch data and authorization boundaries. List view retains all correction/cancellation/CSV controls.
- External React Big Calendar and FullCalendar Standard MIT candidates reviewed; neither added, because native shared logic and React/Tailwind cover this bounded view without extra runtime dependencies, notices, lockfile changes or vendor coupling. See `docs/HR004_ROSTER_CALENDAR_REUSE.md`.
- Test: date-only Monday-first calendar, leap days, read-only SSR, HTML escaping, deterministic multiple events, branch labels, overnight label, no mutation and Web/Windows wiring. Run all exact-head required gates before considering merge. No production schema/credential changes.
- **Scope boundary:** view only; NOT recurring batch approval, policy activation, UTC/rest guard, Offline/Hybrid acceptance or authenticated real customer UAT. Master Vision remains ~51%; stable public installer v1.0.15 until independently verified. Do not count this small UI slice as a 1% full-scope increment.
- Next after green merge: return to HR-004C reviewed-policy lifecycle/UTC-rest guard activation with real PostgreSQL tests and HR-004B dependent conflict recovery. Maintain reuse-first/source-license audit for every future module.


## HR-004C Web administrator review UX — pending CI verification

- Source baseline main `12ccd4713f2d4b11a8ef49f9290348c2bb03c09f`; existing production review migration already deployed; no duplicate migration.
- New review UI: explicit load, version-specific approve-pending-activation/reject, required rejection reason and administrator acknowledgment, immutable history, stale-decision lockout.
- Session-pinned administrator authorization, tenant-confirmed RPC response, no local/outbox approval, denied active-state response. Tests include React Chrome interactions and negative client checks.
- **Not actual scheduling enforcement:** both draft and reviewed-policy records remain inactive, existing roster trigger unchanged; no genuine hosted customer UAT yet. Follow-up: revocation/effective history, server UTC/rest guard cutover, Offline/Hybrid parity and installer.
- Entire Master Vision remains ~51%; no extra paid infrastructure.

## Verified HR-004C immutable policy reviews rollout — October 11, 2026

- PR #320 merged into `main` as `607bd19ad7ac1f80404fc38b44bf2c5a6dac7b83`, after 20 successful, 2 skipped, 0 failed exact-head checks. The first failed CI was a **test privilege error** (authenticated test role was improperly reading protected `audit_logs`); corrected by verifying audit history under the isolated privileged fixture, **without relaxing production access**. Post-merge `main` CI: 21 successful, 5 skipped, 0 failed.
- Applied the merged `20261011_hr_roster_policy_review_history.sql` migration (GitHub blob `7f26b4a3d8cea46038d1382128498f28172fa3ad`) to Supabase `wmjgefbaliuwmaxyzxkq`, `success:true`; migration history entry `20261011032956`, `hr_roster_policy_review_history`.
- Live read-only verification: `staff_roster_policy_reviews` exists, RLS and FORCE RLS enabled, one manager/admin RLS read policy and one append-only mutation trigger. Authenticated table SELECT true, authenticated INSERT/UPDATE/DELETE false. `review_staff_roster_time_policy(uuid,integer,text,text)` is SECURITY DEFINER and authenticated executable with verified server-side admin role check; anonymous execute denied. No existing `staff_roster_guard()` review dependency. Production organizations 0, review rows 0.
- New behavior: tenant-admin-approved-pending-activation or rejected review decisions; immutable versioned snapshot/supersession history; rejection reason, optimistic conflict, branch-period overlap guard and audit. **No active enforcement**: all snapshots have `activation_state='inactive'` CHECK, draft records remain draft-only, no UI approval flow, no actual approved policy used by rostering. No fabricated production customer UAT.
- **Next:** authenticated manager/admin Web approval/rejection UX with secure response/tenant pinning and explicit non-activation copy; review revocation/cancellation and safe effective-dated approved-policy selection; server `staff_roster_guard()` cutover only after isolated real PG17 history/cross-branch/DST/rest and legacy tenant migration acceptance. Offline/Hybrid parity, customer UAT and a verified installer remain open.
- Last verified stable installer `v1.0.15`. Full Master Vision still ~51%; do NOT increment from small PRs or CI alone. No new paid service.

## Active next HR-004C slice — immutable reviewed policies (pending activation)

- Source baseline: main `258c971c374606ad816689f49491a5f9cdbcbc1f`; 0 open PRs/issues, all post-merge checks green, production SQL migration history through `hr_roster_utc_rest_primitives`.
- Next bounded source milestone adds `staff_roster_policy_reviews`: append-only, tenant-RLS + FORCE RLS, admin-authorized review of manager drafts, immutable versioned snapshots, rejection reasons, audit, stale-review conflict detection, approved-pending-activation intervals, and explicit same-draft review supersession history.
- **Critical separation:** `activation_state='inactive'` is enforced by CHECK, draft table remains `status='draft'`, existing `staff_roster_guard()` is unmodified; approval-for-activation does not enforce anything in customer scheduling. UI approval workflow, legally approved effective-date authority, reversals and policy cutover are separate future milestones.
- Real isolated PostgreSQL17 test suite must prove admin/manager/cashier and cross-tenant boundaries, stable history after draft changes, same-version review prevention, overlapping period rejection, denial of update/delete even by privileged actors, and full rollback.
- No fabricated production customer tests, no paid dependencies and no extra master completion percentage. Full Master Vision stays **~51%**. Deploy additive SQL only after exact-head AND post-merge green checks and read-only production gates.

## Verified HR-004C server UTC/rest primitives rollout — October 11, 2026

- PR #318 (`https://github.com/evertekitsolutions-del/minarvabiz/pull/318`) merged into `main` as `17ce51abcd805725b1eccc6eb5a1db3a61f16ec4` after **20 successful, 2 optional skipped, 0 failed** exact-head checks. Post-merge `main` verification finished **21 successful, 5 optional skipped, 0 failed**.
- Applied exact merged SQL `supabase/migrations/20261011_hr_roster_utc_rest_primitives.sql` (blob `fb124dea7c842d7223e7211e77ff554a1dbf944e`) to production project `wmjgefbaliuwmaxyzxkq` via Supabase migration tool, returned `success:true`. Supabase migration history now records `20261011030016` `hr_roster_utc_rest_primitives`.
- Live read-only function audit: `roster_shift_utc_window` and `roster_assert_utc_rest` exist, SECURITY INVOKER, anonymous/authenticated EXECUTE denied. `2026-10-10 09:00–17:00 Asia/Kolkata` resolves to `03:30–11:30 UTC`. `staff_roster_guard()` does NOT call these helpers yet. Current production count is 0 organizations, 0 roster slots and 0 policy drafts.
- **This is an additive internal validation foundation, NOT enforcement activation.** Existing roster behavior/history untouched; status remains draft-only, no approved/effective-dated policy authority, no live authenticated customer UAT, no recurring approval or Offline/Hybrid completion. A green Windows source smoke is not a new public installer; latest last-verified release v1.0.15.
- Next after this verified rollout: tenant-authenticated policy review/approval history and additive server roster-guard UTC overlap/minimum-rest activation with cross-branch, DST, retroactive-policy and rollback tests. Keep fail-closed branch selection, unapproved drafts non-binding, and no invented tenant UAT. Whole Master Vision remains **~51%**, not HR-004 progress.

## Active HR-004C server UTC/rest validation milestone — source candidate

- Continue from merged main `563dace9be99abc9fe6ef39b46c26bba5322094a` (PR #317). Production policy draft migration `20261011021532` already applied and security inspected; no rollback or re-run of #315/#316.
- Next proposed incremental source migration `20261011_hr_roster_utc_rest_primitives.sql` adds internal-only `roster_shift_utc_window()` and `roster_assert_utc_rest()`. These use explicit branch IANA + fold policy to resolve real UTC shift endpoints and validate actual elapsed-time overlap/rest symmetrically, including overnight and cross-branch scenarios.
- Real PostgreSQL 17 isolated E2E checks London spring, New York folds/gaps, Lord Howe half-hour adjustment, India/US cross-branch overlap, minimum rest thresholds, invalid arguments and browser-role execution refusal. CI plus portable fresh-instance migration order must pass before merge.
- **Not activation:** No change to `staff_roster_guard()`, no approved policy transition, no production deployment, no privilege expansion, no new Windows installer. Production still lacks enforcement/approval and real authenticated tenant UAT. Next milestone is approved policy history/activation, branch-policy selection and roster guard integration with full cross-branch/draft-vs-approved controls.
- Master Vision estimated ~51%; code/CI milestones alone do not warrant an invented 1-point increment.

## Verified production database rollout — October 11, 2026

- Live main before this documentation PR: `dd6f2938dd083201baf8191acccda955b6b48093` (#316 merged). Open PRs/issues: 0. Main push CI, Secret Scan, Dependency Security and Final Release Audit completed successfully; latest Windows release is still `v1.0.15`.
- Supabase `wmjgefbaliuwmaxyzxkq` is `ACTIVE_HEALTHY`. The previously blocked, **unaltered** merged source migration `supabase/migrations/20261010_hr_roster_time_policy_drafts.sql` (blob `2902b90796c87680317768490832e46213163d4f`) was **successfully applied** via the authorized Supabase migration tool; tool returned `success:true`.
- Immediate read-only PostgreSQL verification: `public.staff_roster_time_policies` exists with RLS and FORCE RLS enabled; one SELECT policy, one validation trigger, manager-draft RPC `save_staff_roster_time_policy_draft(uuid,date,text,text,integer,integer,date)` exists and is SECURITY DEFINER; authenticated users have RPC execute and SELECT but not direct INSERT/UPDATE/DELETE; `anon` cannot execute RPC. Production organizations 0, drafts 0.
- These results resolve the historical connector `Invalid or expired requestState` deployment blocker described below, **not** the end-to-end product. This migration allows drafts only (`status='draft'` CHECK). It does not activate approved UTC overlap/minimum-rest policy enforcement, recurring approvals, Offline/Hybrid parity, real customer tenant UAT or an installed Windows upgrade.
- Next action: verify SQL migration-history registration/target and implement separate server-side UTC/rest enforcement and approval only after real PostgreSQL DST, cross-branch, history and authorization tests; maintain immutable existing roster history. Continue HR-004B multi-event and browser crash recovery. No fabricated customer records, paid services or Master Vision percentage uplift. Whole Master Vision remains ~51%.
- Statements further below that production draft policy table/RPC are absent are historical snapshots **superseded** by this verified October 11 rollout.

## Active source continuation — October 10 HR-004C

- Live source baseline for the manager draft editor: `d30a7553a1420da91930947cf9292b5e891dd3ed` (#315). Main checks verified 21 success, 5 skipped, 0 failed; open PRs/issues 0 before this branch.
- #314 PostgreSQL IANA instant resolver and #315 audited tenant/branch effective-dated timezone/minimum-rest DRAFT policy schema are merged. They do not activate server roster UTC/rest enforcement.
- PR #316 tested code head `b5cf379d3c1c2684715003975e42dbed559b5218`: 19 checks successful, 2 optional skipped, 0 failed, including actual Chrome policy editor smoke and Windows installed smoke. Independent review invalid-input form lock was fixed.
- Production rollout: IANA resolver migration applied successfully. Draft-policy migration failed twice in Supabase connector with `Invalid or expired requestState`; read-only verification confirms `staff_roster_time_policies` and draft RPC are still ABSENT. Do not claim live policy saving. Restore the connector migration path and apply the already-merged #315 source unchanged, then check privileges/RLS. Production remains 0 organizations / 0 staff; no customer UAT fabricated.
- Current work connects manager Web roster UI to authorized draft read/create/revisioned update, with session pinning, stale-save conflict review and explicit non-enforcement notice. See `docs/HR004_ROSTER_DELIVERY_STATUS.md` for scope/tests and acceptance limits. Do not restart #314/#315.
- Next after draft editor verification: additive server UTC overlap/min-rest activation and approval with history/cross-branch tests; then recurrence, multi-event recovery and Online/Offline/Hybrid acceptance. No fabricated real production tenant tests.
- Latest stable release verified live: `v1.0.15`, published 2026-10-02. Source changes are not a new installer. Whole Master Vision remains approximately **51%**, not HR-004 completion.

## Active continuation — October 9 HR-004 shift/roster

This section supersedes the historical October 8 Attendance instructions below. Always verify live GitHub main/PR/issue/exact-head CI first; never treat these SHAs as guaranteed current in a later session.

- Latest verified merged main at this documentation update: `fb6394fada4d85f58def9c2a19c3d8196d68ae09` (PR #312).
- HR-002 Attendance Grid parity was previously merged; do not restart it. HR-004 shift/roster groundwork #280–#291 was merged before this batch.
- Later HR-004 milestones merged: #292 shift activate/deactivate with history, #293 roster CSV export, #294 session-revoked cloud outbox protection, #295 IANA-aware actual UTC DST validation foundation.
- #296 `b6880ff59c02c926af076a61f474dfd9fcf385c6` hardened authenticated Web roster hydration; #297 `7e3d1f915e5e29108d68f4fc52f15370a3aa69ec` enabled role-gated atomic RPC Web writes and retry; #298 `05b5b61bd1f8417a5238721fe85abe58469e8131` added read-only local/Cloud comparisons; #299 `7c8695bf5d541d163e008892659967d45d9f8fd1` added explicitly confirmed Keep Cloud resolution with event preservation and stale review/dependency guards. For #296–#299 all exact-head check runs finished 19 successful, 2 optional skipped, 0 failed before merges.
- #301 `dcc1a2bb03e46947d5d1a9e93fd3f380ef86a02f` merged manager-confirmed Reapply Local for an isolated same-ID Cloud conflict with fresh authenticated snapshot, revisioned replacement event, audited history and RPC confirmation/failure replay. #302 `f2fc468728172b20588de10e548a430165f71dd6` merged real SQLite binary corruption/backup recovery and immutable outbox replay test. Each exact-head gate passed 19 success, 2 optional skipped, 0 failed.
- #303 `eb867ea55ef71f1d36e983b96b2ae4d47ebfbe2f` updated continuation; #304 `c0bb711b69ee9bbd2c1ff0402e9812080939f685` added AES-GCM, user/organization-partitioned non-extractable-key IndexedDB recovery vault; #305 `7eae7c7000e9fef1b459336c530cc4ef8ff5cd76` added PostgreSQL-authorized pre-RPC encrypted checkpoint, sealed-event immutable identity guards, confirmation/retry checkpoint, and read-only crash quarantine. Every #303–#305 final exact-head CI passed 19 successful, 2 optional skipped, 0 failed; an initial #305 static test mismatch was fixed and fully rerun.
- #306 `49e63179323816c7c5fe5bf882de9fc4110a538f` updated continuation; #307 `59d7c6e0ef500cc226767c7590d47f84de03d030` implemented authorized read-only sealed Web roster versus Cloud comparison, explicit RLS-missing/hidden status, session-revocation checks and bounded 25-event review. #308 `fbc7827d16b3f5bd9402775d7b3525adb45c6616` implemented explicit manager-confirmed LOCAL-ONLY restoration of one saved same-ID update whose currently authorized remote version is exactly one revision behind. It preserves original immutable event ID/device sequence/payload and keeps the encrypted backup. No automatic Cloud RPC or auto-replay. #306–#308 exact-head checks were 19 success, 2 optional skipped, 0 failed; #307 initial Web TS error was fixed and rerun green.
- #309 `bf2d1aff0b25dcab3671e231a3efee89edbb5c06` updated continuation after #308. #310 `9dddc846fe40b34ebcd0da4af669ebd14c295000` added REAL Chrome IndexedDB native crypto-key persistence, browser reload, tamper and partition smoke. #311 `35ca4a070f8312f7bad43023e9217dfafe085346` added atomic per-scope revision compare-and-swap for encrypted save, preventing two tabs from silently overwriting newly sealed events. #312 `fb6394fada4d85f58def9c2a19c3d8196d68ae09` added atomic revision-checked encrypted erase, rejecting stale-tab deletions. All #310–#312 exact-head gates passed **19 success, 2 optional skipped, 0 failed** before squash merge. No new recurring paid services, Supabase customer writes, or release publishing.
- Read `docs/HR004_ROSTER_DELIVERY_STATUS.md` for verified behaviors, production gates and next work. Browser pending events are encrypted before online RPC. After restart the manager can compare sealed data against current Cloud, and manually restore one safe same-ID event into local memory **without sending it**. Multi-event dependencies, differing canonical IDs, Cloud conflicts, browser eviction, complete session/tenant UAT and automatic recovery remain unsupported. This is NOT full Online/Offline/Hybrid recovery parity.
- Real Supabase metadata was verified read-only: roster tables and private receipts exist, RLS + FORCE RLS are enabled, anonymous atomic RPC execution is denied, authenticated RPC execution is allowed under server organization-membership authority. No real authenticated tenant production UAT was performed in this batch; customer fixtures were not invented.
- Stable customer Windows installer last separately verified remains `v1.0.15`. GitHub source Windows smoke passing is not a newly published installer; verify newer release artifacts live before claiming any upgrade.
- **Full MASTER VISION estimate remains approximately 51%** until materially larger whole-product functionality and required Online/Offline/Hybrid/release acceptance are complete. Small PRs, documentation or green CI alone must not fabricate an extra 1 percentage point.
- **Next implementation:** HR-004C tenant-owned branch IANA timezone, explicit DST fold/gap policy and configurable min-rest enforced by PostgreSQL; design additive migration and real PostgreSQL e2e before production deployment. Continue HR-004B multi-event dependency/canonical-ID recovery and full authenticated restart/tenant-switch/eviction UAT; then recurring approval and Windows release. #310–#312 browser storage hardening does NOT prove all these production acceptance gates. Do not restart previous work, simplify scope, bypass RLS or invent production tests.
- Preserve Vercel/Render transitional fallbacks until verified replacement parity; avoid new lock-in and maintain PostgreSQL/S3/self-host AI portability. First ~25 paying customers is a review checkpoint, not automatic spending authorization.

## Historical continuation — October 8 Attendance cloud parity

This section supersedes older active/next-step descriptions below; retain them as historical evidence.

- Verified main baseline: `27bed7c3a44a4643653c7e3ae0fc86b4f0856bdd`. Attendance PR #273 is merged; its head `cb826200fa1af98b87488ac90cc149ed6cf0dfd1` passed all deterministic workflows. PR #274 is closed, unmerged.
- PR #276 integrates PR #275 branch filtering, worked-time totals, archived history, pending cloud overlay and reviewed conflict UI with atomic PostgreSQL attendance/event/audit authority.
- Current continuation branch: `fix/attendance-cloud-parity`. Preserve the existing Attendance implementation; do not restart or reopen #274.
- Read `docs/ATTENDANCE_GRID_DELIVERY.md` for identified gaps, implemented corrections, rollout gates and explicit remaining limitations.
- Production was checked read-only: Attendance table/event RPC were absent. New schema must be applied additively only after merged verification; do not report a live grid from code merge alone.
- Next: complete exact-head gates and isolated attendance SQL proof, merge the correction, apply all three attendance migrations together, verify production authority, then complete authenticated browser and Windows release acceptance.
- Stable Windows remains v1.0.15. Newly merged Attendance source is not automatically installed in existing v1.0.15 clients.
- Full MASTER VISION baseline is approximately 50%; CI/audit/PR creation alone do not increase it. Honor the user's minimum verified full-scope increment per Continue batch, with only mandatory user-owned credential/approval blockers as an exception.
- Preserve live Vercel/Render fallbacks until their replacement parity is proven. No paid infrastructure addition is authorized.

## 1. Mandatory continuation protocol

For every new chat or every user message meaning **Continue**:

1. fetch the actual `main` HEAD;
2. inspect open PRs/issues and current workflow state;
3. read this file;
4. read `docs/MASTER_PRODUCT_PLAN.md`;
5. read `docs/CAPABILITY_REGISTRY.md`;
6. read `docs/AI_CAPABILITY_REGISTRY.md` when the milestone touches product/AI scope;
7. read `docs/ENGINEERING_REUSE_POLICY.md` before substantial implementation/refactor work;
8. never restart already merged work unless live evidence shows a regression;
9. complete only the next small milestone without reducing the agreed final feature scope;
10. research existing Minarva code, official SDKs and license-compatible open-source implementations before substantial custom coding;
11. branch -> implement -> test -> PR -> wait all required checks -> fix failures -> merge only when green;
12. update this continuation file whenever the authoritative next step materially changes.

Do not rely only on chat memory. The repository documents are the durable source of truth.

## 2. Permanent product vision

Minarva Biz is a **global, AI-first, local-first business operating platform for SMBs**, not a boutique-only billing application.

Long-term target:

- billing;
- accounting;
- inventory;
- POS;
- procurement;
- CRM;
- HR / Attendance Grid / payroll;
- online store;
- business website;
- domain purchase/renewal;
- marketing;
- manufacturing;
- field service;
- projects;
- industry packs;
- country/tax packs;
- AI agents;
- integrations/marketplace;
- self-service subscription/entitlements;
- local-first multi-branch sync;
- future Minarva-owned/self-hosted infrastructure.

The master definition is `docs/MASTER_PRODUCT_PLAN.md`.

## 3. Non-negotiable architecture rules

- one shared core; no separate codebase per industry;
- country-specific compliance belongs in Country Packs;
- industry differences belong in Industry Packs;
- Online + Offline Windows + Hybrid share business logic;
- Windows/branch operations should remain usable offline wherever reasonable;
- SQLite is the local-first desktop store;
- PostgreSQL-compatible central data model is the shared cloud/global authority;
- sync must be branch-aware, idempotent and event/ledger-safe;
- primary business data must not be trapped in provider-specific proprietary storage;
- object storage must have an S3-compatible migration path;
- AI must be provider-neutral and later support Minarva-owned inference;
- no mandatory recurring paid infrastructure dependency before the first 25 paying customers unless explicitly approved;
- 25 customers is a review point, not automatic permission to spend;
- any provider integration must define export/migration/replacement behavior;
- implementation difficulty must not silently reduce or delete an agreed feature;
- “small milestone” means sequencing only, not a simplified final product;
- blockers must be root-cause-fixed rather than hidden by disabling required behavior;
- external code may be reused only after source, license, security, maintenance and portability checks;
- publicly visible GitHub code without a clear compatible license must not be copied.

## 4. Current commercial release

Stable Windows release remains:

- **v1.0.15**
- installer: `MinarvaBiz-Setup-1.0.15.exe`
- installer SHA-256: `9556d3ad6b3db4818f19f5c7abc53c3b191977ff684ffaf2c5f8d86ac72a1576`

Recent Cloudflare/admin backend work does not by itself require a new Windows release.

## 5. Latest verified development state

First-admin browser cutover, fresh-instance proof and privileged server-helper retirement are now merged:

- PR #236 merged the browser-native first-admin bootstrap cutover; merge commit: **`358dacd11f006298e0694bb4cae92c34ee39564e`**
- PR #237 merged provider-neutral HTTPS / loopback-local Supabase origin portability for Cloudflare; merge commit: **`0a3cce3f40f8f619c74a3827e3c8753145f2f1ed`**
- PR #238 merged the isolated fresh-instance proof and migration-history recovery milestone; merge commit: **`420638c824887bfa9a3b4537d881a87297fb540e`**
- PR #238 final tested head **`d9068071e6786ef534d8304ef1cf597bf7793fe0`** passed all normal gates; the dedicated fresh-instance workflow replayed **65 repository SQL migrations** transactionally on a brand-new official Supabase local stack and passed the complete first-admin path
- the proof covers: empty admin/Auth state, bootstrap status, invalid/wrong-email rejection, reservation anti-rotation, reserved-email anti-theft, Cloudflare random unknown initial credential, tenant-bootstrap exclusion, mailbox confirmation, mailbox-owned password setup, AAL1 claim rejection, real TOTP enrollment/challenge/verification, AAL2 claim, `/api/admin/me`, second-claim closure, and post-bootstrap normal customer org/profile/membership/HQ creation
- no production Admin identity was reset or deleted and no production data was used to manufacture an open-registry state
- no paid dependency or new Minarva runtime dependency was introduced; the E2E uses official Supabase CLI **2.119.0** and immutable-pinned official `supabase/setup-cli` **v3.0.1**
- fresh replay exposed repository migration-history drift; production migration history was used read-only to restore the missing applied `20260911_rls_security_hardening`, `20260911_rls_policy_cleanup`, and `20260911_performance_cleanup` SQL, restore `006_integrity_indexes.sql` to the SQL actually applied in production, and order tenant bootstrap before the later policy alignment that depends on it
- corrective migration `20261005_license_admin_bootstrap_metadata_sanitization.sql` enforces the trusted bootstrap metadata invariant across Auth user inserts/updates and strips transient `account_type` / `bootstrap_token` carriers from both Auth user and identity metadata
- PR #239 retired the obsolete privileged normal first-admin Next/Render server helpers `firstAdminBootstrapStatus` and `bootstrapFirstLicenseAdmin`, plus private support code used only by those helpers; merge commit: **`59b2cee66461b0928722bc04c2e5c9cee3869dc7`**
- PR #239 final tested head **`4c18156bfcbde0c8a7c281e054c48083270966a4`** passed **First Admin Fresh Instance E2E**, CI, Windows Feature Click Smoke, Windows Deep Installed Smoke, Licensing Smoke, SAST, Dependency Security, SBOM/License Policy, Coverage Ratchet, Secret Scan, Staging Security + Performance and Final Release Audit; Claude review remained skipped by governance/config
- the post-retirement fresh-instance E2E explicitly proves the normal bootstrap UI has no server-actions dependency, the retired privileged first-admin exports are absent, and `loginEmergencyAdmin` / `logoutEmergencyAdmin` remain present
- stable Windows release remains **v1.0.15**; these control-plane milestones do not themselves require a new Windows release

Current normal named-admin behavior:

- password authentication occurs browser -> Supabase Auth
- TOTP enrollment/challenge/verification occurs browser -> Supabase Auth
- resulting AAL2 token is verified at Cloudflare `/api/admin/me`
- verified AAL2 session is kept only in browser `sessionStorage` for the current tab/session
- no refresh token is persisted in this phase; expiry fails closed and requires sign-in again
- normal identity, license registry, support inbox, license issue, status changes, offline activation, support updates and customer provisioning call Cloudflare directly
- normal logout clears the browser session and calls Supabase local logout directly; it does **not** call the emergency server logout action
- browser-native first-admin setup is Cloudflare/Postgres + Supabase Auth: status -> reserved signup -> email ownership -> mailbox-owned password -> TOTP AAL2 -> first-admin claim -> `/api/admin/me`
- the obsolete privileged normal first-admin server helpers are removed from `main`
- PR #241 merged the additive Cloudflare/self-host portable emergency authority foundation; merge commit: **`a6057ebeecfddf8ed29cceb156c68717106dac33`**
- PR #241 final tested head **`62fe84c26d3a312ca140489d158b8c820cab0e93`** passed the fresh-instance E2E plus all normal CI/security/Windows gates
- the emergency foundation adds a private current/previous emergency credential SHA-256 registry, bounded previous-credential grace, persistent rate limiting/backoff, admin-only <=15 minute revocable emergency sessions, SHA-256-only session-token storage, and login/logout audit
- the fresh-instance E2E exposed and additively fixed the historical `record_license_admin_login_failure()` PL/pgSQL column/output-name ambiguity; historical migration files remain unchanged
- defense in depth is explicit: the generic edge RPC secret alone cannot mint an emergency admin session; a matching private emergency credential digest is also required
- existing Next/Render emergency login/logout remains operational and must stay until the Worker/browser replacement is proven end to end
- PR #243 merged Cloudflare emergency status/login/me/logout routes; merge commit: **`fb9806194b839b2f342a46ef1237bcea34340df1`**
- PR #243 final tested head **`e0f00f984eff43aef6a76159e592845ec7b0f6d8`** passed Cloudflare Edge Smoke, 67-migration fresh-instance E2E, Worker emergency route E2E, CI, Windows Deep/Feature Click, SAST, dependency/license/secret/release/staging and coverage gates
- production Supabase now has `license_admin_bootstrap_metadata_sanitization`, `cloudflare_admin_emergency_authority`, and `cloudflare_admin_emergency_status` applied and verified; private emergency credential registry remains intentionally empty
- production Cloudflare Worker was updated from merged `main` content only; deployment **`2e61ceb4-92d0-4888-a20c-1370c42e46ba`**, version **`db1ff2c4-7f01-4ee4-a328-4945ff04c020`**, 100% traffic
- Worker bindings/secrets were preserved exactly; no emergency-enable/actor binding was added, so Cloudflare emergency login remains disabled in production and the existing Next/Render emergency path remains authoritative
- production post-DDL security advisor has no new critical finding; deny-all private/RBAC tables and edge-secret RPC WARN/INFO findings are intentional architecture findings, while leaked-password protection remains a separate existing configuration warning
- PR #245 merged the zero-secret-exposure legacy emergency authority synchronization bridge; merge commit: **`9eb29aa1d9468087937600ebb22c23cc3b56c220`**
- PR #245 final tested head **`d7aa8f9f7c434c32f880a6f023219d3ec917d7dd`** passed fresh-instance E2E, CI, Windows Deep/Feature Click, Coverage, SAST, Dependency Security, SBOM/License Policy, Secret Scan, Licensing Smoke, Staging Security + Performance and Final Release Audit
- the sync path hashes the existing Render current/active-previous emergency credentials inside the trusted server process and sends only SHA-256 digests plus safe enable/actor metadata to a service-role-only PostgreSQL RPC
- synchronization is idempotent, rotation/rollback-safe, bounded to the existing <=24-hour previous-credential grace, audit-safe, and missing/invalid legacy config cannot clear a valid current authority
- production Supabase migration `license_admin_emergency_legacy_sync` is applied and verified: anon/authenticated cannot execute the sync RPC, service-role can execute it, and direct private-table SELECT remains denied even to service-role
- Render startup wiring was root-cause-fixed in `render.yaml`: the digest sync script must execute before `next start`; CI has a regression guard for this exact production start contract
- production private emergency credential/runtime registry is currently still empty, so the Render startup sync has **not yet been observed in production**; Cloudflare emergency login remains disabled and the existing Next/Render emergency path remains authoritative

## 5A. Active Render-retirement cutover milestone

- PR #249 merged the browser-native emergency Cloudflare UI; browser emergency login/session/business operations no longer require the legacy Next/Render cookie interaction.
- PR #250 merged named AAL2 self-service emergency authority. A named Supabase administrator with TOTP AAL2 and role `admin` can rotate or disable emergency authority through Cloudflare/PostgreSQL; Cloudflare generates the credential, PostgreSQL stores only SHA-256, and plaintext is returned once to the authenticated browser.
- Manual emergency ownership rejects later legacy Render synchronization, so copying the old Render credential is no longer a cutover prerequisite.
- **PR #251 is the active milestone**: retire the Render-dependent License Admin runtime definition and active server-side UI hydration/mutation path while preserving browser -> Cloudflare administration, emergency rollback safety, request-bound CSP nonces, Ed25519 license-key portability, and all security/compliance gates.
- PR #251 removes `render.yaml` from the repository and removes legacy startup synchronization from the License Admin start command. This repository change does **not** authorize deleting/disabling the live production Render service before the named AAL2 manual emergency credential has been established and production Cloudflare emergency login/me/business/logout/revocation/backoff parity is proven.
- The dependency-security gate discovered the upstream Sharp/libvips advisory during this milestone. The branch pins patched Sharp >=0.35.5 and explicitly reviews the resulting LGPL libvips runtime under the existing distribution-compliance obligations.
- After PR #251 exact-head gates are green and it is merged, the next operational step is additive production migration/deployment from merged `main`, named AAL2 self-service emergency rotation, live parity proof without exposing the raw credential, and only then retirement of the live Render fallback.
- Vercel remains a separate mandatory-dependency retirement milestone after Render cutover proof; it must be migrated with provider-neutral/self-host parity rather than simply disabled.

## 5C. October 8 License Admin security and portability continuation

- PR #259 merged recovery-token hardening: Supabase recovery bearer credentials are captured only in memory and scrubbed from the browser URL/history before user interaction.
- Production named-admin authority was verified against `public.license_admin_identities` and `cloudflare_admin_me()`; the active linked identity is role `admin`, and the RPC requires AAL2. The unrelated historical `profiles.role` table is not the License Admin authority.
- PR #260 merged named-AAL2 emergency self-service UI. It exposes safe status/create/rotate/disable controls only to named admin sessions; one-time raw emergency credentials remain React memory only and require explicit save acknowledgement before dismissal or another destructive control action.
- Production emergency authority remains intentionally disabled/uninitialized until the named administrator performs the browser-only credential creation step and stores the one-time credential locally without sharing it.
- PR #261 is the active portability milestone. It replaces source-level Cloudflare Worker endpoint coupling across normal admin, bootstrap/auth, emergency login/control/logout and password recovery with validated client-safe `NEXT_PUBLIC_LICENSE_EDGE_URL`; remote origins require HTTPS and HTTP is accepted only for loopback development. The current Worker remains a transitional default so existing production keeps working.
- PR #261 first CI attempt exposed a literal escaped-newline insertion in four TypeScript imports; this is a branch implementation defect, not an architecture blocker. It was root-cause-fixed on the same branch and must pass a fresh exact-head gate set before merge.

## 5B. Provider-neutral License Admin hosting merged

- PR #252 merged on 2026-10-07 with merge SHA `0f3d9d36a24e45e6e526468212f14ca0a0fb215d`.
- License Admin is now a browser-only Next static export. The deployable artifact is `apps/license-admin/out/`; it can be served from any HTTPS static host or future Minarva-owned server.
- Obsolete Next server actions, service-role helpers, signing-key server module, License Admin API routes, middleware, and Render-era server smoke contracts were removed from the active License Admin host.
- License/support/customer-provisioning/admin authentication operations are browser -> Cloudflare/PostgreSQL authority only.
- Security-header expectations for the static artifact live in `apps/license-admin/public/_headers` and are enforced by CI; no privileged server secrets may appear in the exported artifact.
- Licensing/update/support contract tests now assert the Cloudflare edge authority rather than deleted Next API routes.
- PR #252 exact head `371b7c25e27334c2eaf1af8f8f545a3701603f95` passed CI, Coverage Ratchet, First Admin Fresh Instance E2E, Staging Security + Performance, Dependency Security, SAST, SBOM/license policy, Licensing Smoke, Final Release Audit, Secret Scan, Windows Deep Installed Smoke, and Windows Feature Click Smoke before merge.
- Production Cloudflare `LICENSE_ADMIN_ALLOWED_ORIGINS` still points at the existing Render License Admin origin. Do not remove that live origin/service until the merged static artifact is deployed to a replacement HTTPS origin, that origin is added additively, named AAL2 admin operations are proven, manual emergency authority is established, and emergency parity is proven.
- Production emergency runtime configuration was last observed uninitialized; raw emergency credential handling remains an interactive browser-only security boundary and must never be copied into chat, GitHub, logs, or hosting configuration.
- Next implementation milestone: establish a deployable provider-neutral replacement origin for the merged static artifact, add it to Cloudflare allowed origins without removing Render, run named AAL2 + emergency parity proof, then retire the live Render fallback. After that, remove Vercel as a mandatory online-app dependency using the same additive/provider-neutral method.

## 5C. Provider-neutral static artifact bridge merged

- PR #255 merged on 2026-10-07 with merge SHA `1b94287ee4d5711f1a8957734351511bf4c768ce`.
- A dedicated `License Admin Static Artifact` workflow now builds `apps/license-admin/out`, runs the static-artifact secret/security contract, and publishes a short-retention provider-neutral artifact on both PR and main workflows.
- PR #255 exact head `725fb9b4773605c5fbcdb9508cc32c25bf5367df` passed the static-artifact workflow plus CI, Coverage Ratchet, Windows Deep Installed Smoke, Windows Feature Click Smoke, Dependency Security, SAST, SBOM/license policy, Licensing Smoke, Secret Scan, Staging Security + Performance, and Final Release Audit before merge.
- The verified PR artifact digest was `sha256:47f7aebb5534c9f3d373d0e79749b578bc8c99b7528d88393f8209b8762cd74c`; artifact retention is intentionally short and it contains no privileged server secrets.
- Cloudflare Pages project `minarvabiz-license-admin` exists and its Direct Upload token endpoint is operational. Automatic GitHub source attachment remains blocked by Cloudflare Pages error 8000011 (internal Git installation issue), not by application code.
- Do not remove the Render production fallback yet. The next safe live step is to Direct Upload the verified static artifact to the Pages project (or repair the Cloudflare Git installation), then add the new HTTPS origin to `LICENSE_ADMIN_ALLOWED_ORIGINS` while retaining Render, and prove named AAL2 + emergency parity before Render retirement.
- The connected Cloudflare API can issue the Pages short-lived upload token, but the current connector boundary cannot stream the GitHub artifact bytes into the Pages asset upload API in one operation. Do not create or expose a long-lived Cloudflare API token merely to bypass this boundary.

## 6. Cloudflare License/Admin state

Production worker:

- name: `minarva-biz-license-edge`
- public front door: `https://minarva-biz-license-edge.minarva-biz.workers.dev`

Current customer-facing Cloudflare-native routes include:

- health;
- public verification key;
- signed update manifest;
- commercial activation;
- validation;
- deactivation;
- trial registration.

Current License Admin Cloudflare-native capabilities include:

- admin identity/AAL2 authorization;
- license registry read;
- support inbox read;
- support request update;
- license status management;
- commercial license issuance with Cloudflare signing authority;
- offline activation package preparation/signing;
- online customer provisioning through Supabase Magic Link;
- browser auth config;
- first-admin bootstrap status;
- first-admin short-lived signup reservation;
- first-admin AAL2 claim;
- admin identity verification.

No new Render dependency should be added.

## 7. Supabase role

Supabase remains the current PostgreSQL/Auth data layer. Do not remove it merely to reduce provider count.

Current design intentionally uses:

- PostgreSQL/RLS;
- Supabase Auth;
- publishable-key + caller JWT for scoped authenticated admin RPCs;
- narrow SECURITY DEFINER functions that validate AAL2/admin permissions;
- no service-role/secret key in the Cloudflare admin read/write paths already migrated.

Maintain PostgreSQL portability for future self-hosting.

## 8. Render removal status

Customer-facing license/update traffic and normal named-admin control-plane traffic are Render-free.

PR #249 merged the browser-native Cloudflare emergency UI/session path. PR #250 establishes the Render-independent emergency self-service authority: a named Supabase administrator at TOTP AAL2 with role `admin` can rotate or disable emergency authority through Cloudflare + PostgreSQL. Cloudflare generates the strong emergency credential, PostgreSQL receives only its SHA-256 digest, and plaintext is returned once to the authenticated browser. Manual ownership prevents later legacy Render startup synchronization from overwriting the authority.

The old Render credential/digest synchronization is therefore **not a production cutover prerequisite**. It remains rollback compatibility only until manual self-service ownership is established and the live replacement is proven.

Before removing the legacy Next/Render emergency path:
- deploy the additive PR #250 database migration and merged Worker from `main`;
- use the existing named production admin at AAL2 to establish manual emergency authority without exposing the returned credential in chat, logs, docs or source control;
- prove live Cloudflare emergency status/login/me/business operations/logout, revocation, previous-credential grace, origin enforcement and backoff/rate limiting;
- regression-prove named AAL2 admin operations;
- verify the provider-neutral License Admin UI hosting/origin path;
- only then retire obsolete Next emergency cookie/session/service-role machinery and transitional Render service/configuration.

Live production already contains an active License Admin identity. **Do not reset/delete production admin state for bootstrap testing.** Additive production migrations only. Keep the existing fallback until the replacement has full live parity proof.

## 9. Current signing authority

Current Cloudflare-derived Ed25519 verification key is served by the production Cloudflare `/api/public-key` endpoint and must be live-verified before release/signing checks.

Do not hard-code an old verification key into continuation docs or clients; the older v1.0.14 key is historical only.

Commercial licenses and offline activation certificates must use the Cloudflare-derived signing authority.

## 10. Product-scope authoritative documents

Read these before feature planning:

1. `docs/MASTER_PRODUCT_PLAN.md` — global product/architecture/phases;
2. `docs/CAPABILITY_REGISTRY.md` — full capability inventory/checklist;
3. `docs/AI_CAPABILITY_REGISTRY.md` — cross-module AI roadmap and safety rules;
4. `docs/COMPETITOR_CAPABILITY_BASELINE.md` — Vyapar + global competitor benchmark;
5. `docs/ZERO_COST_GROWTH_ARCHITECTURE.md` — first-25-customer cost/portability rules;
6. `docs/ENGINEERING_REUSE_POLICY.md` — no-scope-reduction, root-cause-fix and license-safe reuse rules;
7. `docs/MULTI_MODEL_REVIEW_GOVERNANCE.md` — independent AI review, innovation review, Claude GitHub review integration rules and final-decision governance.

`docs/WORLD_CLASS_FEATURE_ROADMAP.md` is historical/high-level; the documents above supersede it when scope conflicts.

## 11. Competitor/product rule

Minarva must continuously research and benchmark useful capabilities from:

- Vyapar;
- QuickBooks;
- Zoho;
- Odoo;
- Shopify;
- Square;
- Xero;
- relevant regional competitors.

Do not copy proprietary code/UI/branding. Capture capabilities and design Minarva-native workflows.

Vyapar parity is a baseline, not the endpoint.

## 12. AI rule

Every major new module must explicitly review:

- AI assistance;
- AI search/reporting;
- AI prediction;
- AI automation;
- AI agent actions.

Use `docs/AI_CAPABILITY_REGISTRY.md`.

Consequential actions require policy/approval/audit. AI must not silently post irreversible financial, tax, security or high-impact HR actions.

## 13. Local-first multi-branch rule

Target architecture:

```text
Branch Windows / POS / Mobile
        |
     SQLite
        |
 Outbox + Event Ledger
        |
   Sync Gateway/API
        |
 Central PostgreSQL
        |
 Other branches / Web / Owner views
```

Stock is location-specific. Global stock is derived.

Cross-branch transfer should represent source -> in-transit -> destination receipt.

Every synchronized business event must support unique identity/idempotency.

## 14. Commercial model target

Normal SaaS customer experience should become:

```text
Sign up
 -> select country + industry
 -> select plan/add-ons
 -> pay/start trial
 -> organization provisioned
 -> entitlements activated
 -> app unlocks automatically
```

Manual license keys remain an implementation/fallback detail, not the standard user journey.

The Control Plane must eventually support subscription, plan, add-on, seats, branches, devices, storage, AI allowances, grace/recovery and customer self-service.

## 15. Immediate next milestone

**Historical October 2026 plan retained for audit. The current execution state and next steps are in section 5H below.**

Finish PR #250 and perform the safe production emergency-authority cutover.

1. Require exact-head CI/security/fresh-instance/Windows gates green and merge PR #250 with current continuation documentation.
2. Apply the additive PR #250 migration to production PostgreSQL/Supabase and deploy the Cloudflare Worker from merged `main` only.
3. Through the existing named TOTP-AAL2 admin, establish `manual` emergency ownership using the self-service rotation path. Never expose the one-time plaintext credential or its digest in chat/logs/docs.
4. Prove live status/login/me/business parity/logout, session revocation, bounded previous-credential grace, origin enforcement, rate limiting/backoff and named-AAL2 regression.
5. Keep legacy Render/Next fallback until that proof is complete; then retire obsolete emergency cookie/session/service-role machinery and transitional Render service/configuration.
6. Verify and migrate remaining Vercel-hosting dependencies to the provider-neutral/self-hostable License Admin hosting path before removing Vercel as a mandatory dependency.
7. Resume Global Core, Subscription/Entitlements, Local-first Sync v2, industry/country packs, Vyapar-plus parity and Minarva Intelligence milestones per the master plan.

## 16. Small-milestone rule

Do not try to build the entire master plan at once.

Each milestone must be independently reviewable and mergeable. The user explicitly prefers small milestones because long chats can be interrupted. **This is not permission to ship simplified or reduced features.** If a full capability requires many milestones, complete all required milestones and only mark the capability complete when its agreed behavior and verification are satisfied.

If a chat ends, the next chat must continue from live repository state and these documents, not reconstruct the project from memory.

## 5D. October 8 MFA rotation milestone closed

- PR #261 merged as `f6dcd3bc6f24ebd6a4d054db9c53cc3e7dca6af3`: License Admin browser flows now use validated `NEXT_PUBLIC_LICENSE_EDGE_URL` with the current Cloudflare Worker only as a transitional default. Exact-head CI/security/static/Windows/fresh-instance gates passed and the production Pages deployment succeeded.
- PR #262 merged as `b4b64d66d1e818cf18ef72693ad2ee222c9f2617`: named AAL2 administrators can inventory TOTP factors and perform fail-safe rotation. The UI requires a replacement enrollment and successful verification in the current session before old-factor removal; the client refuses to remove the final verified factor; emergency sessions cannot access the control.
- PR #263 merged as `04385898512cff143efc6f327433e6543253379c`: CI now enforces the MFA rotation safety contract, including replacement-before-removal and no QR/secret persistence or logging patterns.
- Production Pages successfully deployed the #262 merge. #263 production deployment was triggered after merge and should be verified before any browser rotation.
- Production currently reports exactly one verified MFA factor. Because an earlier authenticator enrollment secret was exposed outside the intended local-only flow, treat the current factor as potentially compromised until the administrator uses the production Pages rotation UI. Never paste the replacement QR, secret, or TOTP code into chat or tooling.
- Rotation is an intentional browser-only boundary: after the #263 production deployment succeeds, sign in normally with AAL2, enroll and verify a fresh replacement authenticator, then remove the old factor. Repository automation must not create or retrieve that replacement secret.

## 5E. Provider-neutral main web runtime cutover started

- The main Next.js web runtime no longer changes security/runtime mode based on `VERCEL_ENV`. Demo mode is now explicit through `MINARVA_MODE` / `NEXT_PUBLIC_MINARVA_MODE`; a provider preview can no longer implicitly disable authentication.
- CI enforces a provider-neutral hosting contract: no Vercel host/runtime branching in `next.config.ts` or middleware, standard `next build` / `next start`, explicit production Supabase configuration, and explicit demo mode only.
- Existing `vercel.json` files remain deployment adapters during the safe migration window; they are not runtime business-logic dependencies. Do not delete the live Vercel online app until a replacement host is deployed and parity-tested.
- Production License Edge still has `MINARVA_ONLINE_APP_URL` pointing at the current Vercel online app. Change that binding only after the provider-neutral replacement URL is live and verified.


## 5F. Attendance Grid HR core candidate

- PR #273 is the HR-002 Attendance Grid delivery candidate.
- Shared Online + Offline + Hybrid domain now includes tenant-aware daily attendance statuses: present, absent, half-day, leave and holiday; per-day break/overtime metadata; staff/month summaries; and audited, outbox-backed upserts.
- Web and Windows desktop use the shared Attendance Grid UI with month navigation, per-staff daily marking and bulk today actions.
- Domain snapshot format is v13 and includes attendance so offline backup/restore and desktop persistence do not silently lose HR state.
- PostgreSQL/Supabase migration adds tenant-isolated `staff_attendance` with organization/staff/date uniqueness, branch/device/version fields, RLS + FORCE RLS and authenticated organization policy.
- Executable attendance behavior tests and source/security contracts are wired into CI. Do not mark HR-002 merged until PR #273 exact-head gates are green.

## 5G. Attendance Grid parity / daily time details — PR #275

- Live baseline was main `27bed7c3a44a4643653c7e3ae0fc86b4f0856bdd`: Attendance PR #273 had already merged with all exact-head required gates green. Duplicate PR #274 was closed unmerged; do not restart either branch.
- PR #275 continues that implementation: one shared Web/Windows grid, clock-in/out editor with timezone-bearing timestamps, break/overtime/notes, worked-minute and holiday summaries, branch filtering, archived history and guarded bulk actions.
- Status-only edits retain existing metadata. Domain validation rejects impossible dates/statuses, fractional/negative minutes and invalid clock/break ranges before mutation. Immutable versioned event snapshots preserve prior revisions.
- `/attendance` participates in lazy cloud hydration. Staff, attendance and branch reads are paginated; selected branch survives refresh. Attendance cloud transport lives in `apps/web/src/lib/data-source-attendance.ts` so the main data-source stays within its existing 900-line audit budget.
- Cloud writes await actual mutation and durable event acknowledgement. Ordered per-record draining, per-aggregate failure blocking, event-id replay and optimistic revision checks prevent silent overwrite or acknowledgement of empty updates.
- Pending corrections survive in-session cloud rehydration. Managers can retry or explicitly review local/cloud values and choose a cloud copy or audited local correction rebased on the current remote revision. Superseded events remain in local history as `discarded`. Deferred-read review rejects newer local edits; same-day different-device creations use a staff/date lookup and explicit canonical-ID rebase without duplicate-day totals.
- Online production browser persistence remains the existing session-only policy; do not claim failed changes survive browser closure. The UI warns to keep the window open until confirmed and installs a pending-change unload guard. Windows uses the existing SQLite snapshot v13 persistence. Attendance-specific persistence failures are surfaced while retaining the existing scheduled autosave retry; the details modal does not report success before SQLite confirmation.
- Additive migration `20261008140151_attendance_role_integrity.sql` restricts writes to organization super-admin/admin/manager roles, checks staff/branch tenant relations, protects immutable attendance identity and monotonic revisions, and constrains clock/break ranges without rewriting historical records.
- CI includes a real PostgreSQL red/green isolation test: the original policy must fail the cross-tenant-reference denial assertion; hardened policies must pass role, relation, update and tenant-read cases. Browser deep smoke exercises actual time entry and metadata retention. Installed Windows smoke additionally exercises the shared details editor and verifies status/clock/break/overtime/notes survive a renderer reload from SQLite.
- Reuse: existing Minarva grid, Modal/FormField, phase6 store, snapshot/outbox, authenticated PostgREST, and PostgreSQL RLS primitives; no third-party source copied and no recurring paid dependency introduced. Upstream PostgreSQL/Supabase RLS documentation and changelog reviewed.
- Independent review findings addressed: individual/bulk hidden-branch mutation, archived history loss, selected-branch reset, pending-hydration loss, acknowledgement replay ordering and genuine conflict resolution. Final independent review found no remaining verified critical/important defects after executable regression checks. Exact-head CI remains mandatory before merge.
- Full MASTER VISION estimate entered this batch at approximately **50%**. PR #275's implemented daily attendance/time-entry/cloud-parity scope is the batch's proposed additional percentage point; count approximately **51% only after its required exact-head gates pass and it is merged**. This is a full-master estimate, not a measured milestone ratio.
- HR shifts/rosters, leave-policy management, holiday calendars, late/early rules, biometric/geofence adapters, payroll/statutory packs and full employee self-service remain unfinished master scope. Do not mark those registry entries complete merely because the grid supports daily leave/holiday statuses or manual clock entry.
- Production attendance migrations/deployment and customer UAT must be separately verified; merged source is not a new Windows stable release. Keep v1.0.15 and existing infrastructure fallbacks until replacement/release parity is proven.

## 5H. Attendance Grid merged and production schema verified — 2026-10-09

- Authoritative merged main: `cc59824597c7ef887025eee36d8f81ff57dd1f87` (squash PR #276). Its exact-head gates were **20 success, 2 skipped, 0 failure**; post-merge main checks were **21 success, 5 skipped, 0 failure**. PR #275 was closed unmerged because #276 superseded its attendance work and the older branch retained unsafe silent localStorage fallback behavior. At verification time, open PRs: **0**.
- HR-002 daily Attendance Grid now spans shared business logic, staff/month summaries, day-level clock-in/out, breaks, overtime, notes, branch-scoped and archived views, audited corrections, optimistic versions, durable per-event replay receipts and server-side authorization. This does **not** mean payroll, shifts, leave policy, holiday calendars, biometric/geofence or employee self-service are complete.
- Windows source regression: hundreds of eager full-SQLite exports/queued binary IPC writes exhausted sql.js ASM heap, so new staff and attendance changes existed in memory but were missing after reload. PR #276 debounces automatic mutation persistence, coalesces queued **complete** native SQLite snapshots while retaining the newest, retains explicit durable save/flush and surfaces failed native writes rather than using a misleading localStorage fallback. Both installed Windows smoke suites passed their actual attendance reload assertions, with zero observed `Aborted(OOM)` reports on the verified PR CI.
- Supabase production (`minarvabiz` project) initially lacked `current_user_authorization()`, `staff_attendance` and `staff_attendance_event_receipts`. After the merged code and prerequisite review, the following **source-identical, tracked migrations** were applied successfully in order: `20260927_authoritative_org_rbac` (live migration version `20261009021150`); `20261008_attendance_grid` (`20261009021207`); `20261008140151_attendance_role_integrity` (`20261009021227`); `20261008141024_attendance_event_authority` (`20261009021237`).
- Live post-migration metadata verified that the attendance ledger and private event-receipt table exist; the attendance revision trigger exists; authenticated direct INSERT/UPDATE/DELETE privileges are disabled, authenticated manager-scoped SELECT and atomic RPC EXECUTE are available, and anonymous RPC EXECUTE is denied. Attendance table RLS and FORCE RLS were verified enabled after creation. No existing business data was modified (live organization, staff, attendance, receipts and audit counts were all zero).
- **Not yet verified:** successful live authenticated attendance write/read/conflict/replay through an actual provisioned organization with meaningful permissions. The production project currently has **0 organizations and 0 staff**; do not generate fake production customer/staff records solely to manufacture a passing UAT. Validate the real manager/cashier role boundaries and event replay with the first authorized real tenant, preserving audit data.
- **Master Vision progress:** approximately **51% estimated engineering scope** after completing and merging the HR-002 daily-attendance parity and activating its server schema, up from the previous ~50% baseline. This is a scope estimate, not a weighted measurement of all capability registry entries and not a claim of live customer UAT completion. Retain all unfinished HR and platform requirements.
- **Next safe milestone:** provision/verify an authorized real customer organization (no paid infrastructure), perform production Online/Hybrid attendance end-to-end authority and replay UAT, then continue full HR roster/shift/leave/payroll foundations in individually tested PRs. Stable Windows installer remains **v1.0.15** until a separate tested installer release is published; source merge is not installer delivery.


## 5I. HR-004 shift/roster foundation, persistence and authority — 2026-10-09

- Current verified merged source: main `f247e7b8009ef04a45316a6e2484ac75de3fb5fe`. Four sequential HR-004 PRs have merged: #280 `d86d22f9110e0cb0e300c8924b3dcea89543334c` (pure branch-local shift and overlap/rest planning core); #281 `1ca7391b5cdc5922d8196cb5d6db904f28165787` (audited shift rules, revisioned roster assignments and backwards-compatible SQLite/domain snapshot v14); #282 `f65c68a32b377ae14db88b72c00f9107c868aa24` (tenant-restricted PostgreSQL tables, RLS+FORCE, revision and overnight-overlap trigger, real isolated PostgreSQL E2E); #283 `f247e7b8009ef04a45316a6e2484ac75de3fb5fe` (replay-safe authenticated roster event RPC, private receipts, event/audit atomicity, stale revisions and tenant/role-denial E2E).
- PR #283's exact-head CI was **20 success, 2 skipped, 0 failed**. Local PostgreSQL CI explicitly printed `Workforce roster atomic mutation E2E PASS`, plus prior Attendance/HR roster schema E2E successes; no test gates weakened.
- Live Supabase project `wmjgefbaliuwmaxyzxkq` received the **source-identical migrations after their PRs merged**: `20261009_hr_roster_schema_authority` (Supabase version `20261009044027`) and `20261009_hr_roster_event_authority` (version `20261009045234`). Read-only live metadata verified both HR tables enforce RLS+FORCE and authenticated direct INSERT/UPDATE/DELETE are denied; the manager-authorized RPC exists and is executable by `authenticated`, anonymous EXECUTE is denied, and private event receipt tables deny authenticated read/write with FORCE RLS.
- Production contained **0 organizations, 0 staff and 0 roster rows** at the schema rollout. No artificial production customer/employee fixture was created. **Live authenticated customer UAT is not yet complete**, even though the isolated E2E tests passed.
- This is **not full HR-004 completion**: shift/roster Web and Windows planning UI, cloud adapter/transport sync parity, manual conflict reconciliation, policy-aware rest/shift approval, branch IANA timezone + DST handling, real customer UAT and an independently tested Windows installer release remain required. Existing HR-005 holidays, HR-006 leave, statutory payroll and other master features remain in scope.
- Stable Windows release is still **v1.0.15** unless a later separate verified release proves otherwise. Source merge is not a published customer installer. Continue the existing no-recurring-paid-service policy until the first ~25 paying customers' review checkpoint, and preserve provider-neutral/self-host portability.
- **Full MASTER VISION scope estimate stays about 51%**; 4 merged incremental HR-004 PRs are partial capability delivery and must not be arbitrarily counted as a full +1% or full HR-004 completion. Reconcile delivered UI/Offline/Online/Hybrid scope and release acceptance before increasing the whole-project percentage.
- **Next small milestone:** wire an explicit multi-user-permission HR roster page and shared desktop panel using the already merged roster domain, and connect authorized cloud event transport without dropping local SQLite persistence or conflict/approval policy. Test one coherent slice across Online, Offline and Hybrid before merging; production account UAT remains separately blocked until a legitimate tenant is provisioned.

## 5J. HR-004 UI, cloud writer, conflict review and Keep Cloud — 2026-10-09

- HR-004 source after PR #299: `7c8695bf5d541d163e008892659967d45d9f8fd1`. Prior PRs #284–#291 provided docs, recurring previews, cloud sync adapter, revisions, Windows planner, IANA/DST resolver, authenticated Web reads and atomic outbox writer.
- PRs #292–#299 now also cover soft shift lifecycle, monthly export, auth session revocation, UTC-aware DST client validation, strict cloud record validation, Web edit/retry, read-only conflict compare and confirmed Keep Cloud. All are partial HR-004 implementation, not a full completion claim.
- Exact-head #299 gate: 21 checks, 19 success, 2 optional skipped, 0 failed. Initial test syntax error was fixed on the branch; fresh exact-head CI, browser Web UI, Windows installed deep and feature-click smoke were green before merge.
- Current Web conflicted event recovery: original immutable queued event remains pending/failed until server RPC ack; read-only tenant-specific comparison; Keep Cloud requires explicit human confirmation, re-fetches current cloud state, rejects changed local/remote/revoked session and dependent events, preserves event as discarded (not synced). Reapply Local and durable browser queue are still missing.
- PostgreSQL authority still uses wall-clock overlap checks, so new shared `checkZonedRosterSlot` is not sufficient for server-side DST or configured minimum-rest enforcement. Do not claim worldwide branch-timezone compliance.
- Source and CI do not establish production customer UAT. The last production inspection found no provisioned real organization/staff; no fake production tenant may be created. A separately verified Windows installer release is also outstanding. Until completed, full Master Vision estimate remains approximately 51%.
- Details and pending acceptance are in `docs/HR004_ROSTER_DELIVERY_STATUS.md`; next code milestone is reviewed Reapply Local with safe domain/event sequencing, followed by server-authoritative policy/recurrence gates.


## 5K. HR-004 Reapply Local and SQLite recovery verified — 2026-10-09

- Latest source main after merged #302: `f2fc468728172b20588de10e548a430165f71dd6`; PR #301 merge `dcc1a2bb03e46947d5d1a9e93fd3f380ef86a02f`.
- #301: human-approved Reapply Local after existing read-only conflict comparison. Requires one isolated unconfirmed event, unchanged manager role/session, same canonical remote ID, fresh remote revision, immutable staff/date/branch and historical shift timing, no later dependent events. A NEW immutable update event rebases on remote.version + 1; old failed event preserved as discarded, never rewritten or falsely marked synced. Await audited atomic PostgreSQL RPC; pending/failed replacement remains retryable if rejected or session revoked.
- #301 executable fault tests cover stale Cloud versions, missing/other identity, role/session revocation, multiple pending events, server rejection/retry and original event history. Exact-head gates: 19 successful, 2 optional skipped, 0 failed.
- #302 adds actual sql.js SQLite **binary** backup/corruption/restore regression. The v14 snapshot round-trip preserves shift/slot state and immutable `synced`/`discarded`/`failed` roster events. Invalid reference import rolls back; restored failed event can retry under the exact original ID/payload. All exact-head gates again: 19 successful, 2 skipped, 0 failed. This tests database-engine backup/recovery, **not a production customer installer**.
- Stable installed Windows release remains **v1.0.15**, separately verified on GitHub. Full MASTER VISION remains estimated **~51%** pending durable Web recovery, server policy enforcement, real authorized customer UAT and installer release; no user/production test records fabricated.
- **Next safe engineering slice:** HR-004B tenant-bound encrypted/private browser pending event durability and crash/relogin/tenant switch safe recovery, including security policy and failure injection. Do not store JWT/service credentials in browser outbox or import events from unrelated tenants. Then PostgreSQL-authoritative timezone/minimum-rest and recurring approval.

## 5L. HR-004 Encrypted Web outbox checkpoint progress — 2026-10-09

- Verified main after #305: `7eae7c7000e9fef1b459336c530cc4ef8ff5cd76`. PR #303 docs: `eb867ea55ef71f1d36e983b96b2ae4d47ebfbe2f`; #304 vault foundation: `c0bb711b69ee9bbd2c1ff0402e9812080939f685`; #305 Web integration: `7eae7c7000e9fef1b459336c530cc4ef8ff5cd76`.
- #304 creates a strict whitelist event envelope, verified-scope UUID key, per-user/org sealed AES-256-GCM record with nonce/AAD, IndexedDB non-extractable CryptoKey, corruption/secret/tenant rejection and simulated reload tests. The key co-resides in IndexedDB and is **not resistant to compromised same-origin JavaScript/XSS**; do not imply otherwise.
- #305 resolves user+organization via existing authorized PostgreSQL RPC, never the unverified client role/tenant, and requires permission/current writer generation before encrypted checkpoint. Online Web roster edits persist pending events before the Cloud RPC; matching acknowledged IDs can clear them, and Reapply Local uses optional pre-flush hook. On a later browser open, existing sealed unconfirmed events BLOCK editing; no automatic replay/import is implemented.
- #305 initially failed one static Web contract test because it expected the old Reapply Local call signature. The contract was strengthened to require the new pre-RPC checkpoint callback, and the corrected exact-head run passed all mandatory checks (19 success, 2 optional skipped, 0 failure). Nothing was merged from a failed exact head.
- **Risk/remaining HR-004B:** safely restore quarantined event snapshots into a tenant-authorized domain without stale cross-device overwrite; inspect local/Cloud conflict; preserve exact original event ID and ordering; human review and explicit confirmation; test real browser IndexedDB restart, role revocation, logout and tenant switch. Storage persistence is NOT full recovery. Other remaining HR-004 duties: server DST/rest authority, recurring approvals, production authenticated UAT, verified Windows installer newer than v1.0.15.
- Full MASTER VISION remains approximately 51%; progress is whole product, not HR-004 milestone arithmetic.

## 5L. HR-004B verified sealed browser review and local restore — 2026-10-09

- Live source main after merged #308: `fbc7827d16b3f5bd9402775d7b3525adb45c6616`. #307 read-only Cloud comparison: `59d7c6e0ef500cc226767c7590d47f84de03d030`. #306 documentation: `49e63179323816c7c5fe5bf882de9fc4110a538f`.
- #307 supports a bounded 25-record comparison of authenticated, tenant-scoped encrypted pending events vs current RLS-authorized Cloud records. RLS absent/hidden record is NOT proof of missing data, so no force-create action. It does not import, retry or mutate.
- #308 adds an explicit manager-confirmed **local-only** restore for exactly one unchanged same-ID `update` event with `local.version == currentCloud.version + 1`. It verifies the fresh Cloud record, session/user/organization and writer generation, no existing unconfirmed events, immutable payload/identity and current local Cloud-hydrated state. Validates full roster, refuses altered staff/date/branch and historic shift timing. Keeps original sealed backup; Web Retry remains a second manual decision before audited atomic RPC. Missing/hidden/different-ID or multi-event paths remain blocked.
- Each #306–#308 final exact-head CI passed 19/21 checks (2 optional skipped). Initial #307 optional Web TypeScript version error was corrected on a new head and all gates rerun. No fabricated customer UAT.
- **Not yet accepted:** real browser IndexedDB restart/relogin/logout/tenant-switch/eviction UAT on commercial runtime; dependent event and different-ID same-day conflicts; PostgreSQL server-owned DST/min-rest, recurring approval, authentic production customer UAT and next verified signed Windows installer. Release remains `v1.0.15`; full Master Vision completion baseline `~51%`.

## 5L. HR-004B browser crypto/atomic recovery + HR-004C guard audit — 2026-10-10

- Last verified main: `fb6394fada4d85f58def9c2a19c3d8196d68ae09` (#312). #310–#312 21 exact-head checks each: 19 success, 2 optional skipped, zero failed.
- Real pinned Chrome in CI now exercises actual TypeScript recovery-vault code, native IndexedDB non-extractable AES-GCM key reload, scoped separation, ciphertext tamper refusal and explicit erase. CI demo is not real customer production UAT, profile eviction acceptance or full authenticated application relogin test.
- Original IndexedDB vault used unversioned read-then-write encryption: two concurrent tabs could overwrite a fresh recovery checkpoint. #311 introduces per-scope monotonic revisions, legacy revisionless-record compatibility, and an IndexedDB readwrite-transaction atomic compare-and-swap. Stale writes fail closed; tests include concurrent Node writers and real Chrome stale writer.
- #312 extends atomic revision check to explicit scoped backup erase; a stale browser cannot erase a more recently checkpointed event. No automatic replay or automatic erase added. Browser data may still be evicted; no storage mechanism can promise permanent offline survival of an evicted browser profile.
- Server-side HR-004C audit: `supabase/migrations/20261009_hr_roster_schema_authority.sql` `staff_roster_guard()` compares branch-local wall clocks for shift overlap. `packages/business-logic/src/roster-timezone.ts` has UTC instant and DST fold/gap resolution, but no tenant-approved policy is stored/enforced by the PostgreSQL authority. Configurable minimum-rest enforcement is also absent from the trigger. **Next implementation requires provider-portable additive tenant/branch policy schema, authenticated manager control, explicit DST fold/gap rules, UTC overlap and rest checks, historical compatibility, reproducible PostgreSQL RLS/migration e2e.** Do not substitute client validation for server authority or invent migration success.
- Last separately confirmed stable Windows customer release is `v1.0.15`. Project-wide Full MASTER VISION estimate remains `~51%` until material whole-product scope and production acceptance justify increase.
