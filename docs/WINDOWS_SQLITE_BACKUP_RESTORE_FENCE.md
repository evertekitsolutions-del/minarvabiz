# OFFLINE-NATIVE-02 — SQLite backup/restore IPC reservation fence

## Root cause

Existing Minarva Biz Electron main handlers contain a synchronous validated SQLite binary writer. It is serial **within one main event-loop tick**, but asynchronous database validation, backup copying and restore/rollback yield to the event loop. Another renderer may then save, read a temporarily renamed-away database as missing, or start another backup/restore in parallel. A false empty database can initialize an unwanted empty state, while an overlapping write may be overwritten by restore.

## Implementation — wired into live source, no customer deployment

`apps/desktop/electron/sqlite-ipc-gate.ts` implements a fail-fast, same-main-process reservation for `backup` or `restore`. The production Electron IPC in `apps/desktop/electron/main.ts` now:

- reserves around the **entire** manual/automatic internal backup operation including asynchronous checks, so no renderer write can change the live snapshot while it is verified or copied;
- reserves around the entire post-dialog restore, from source validation through verified pre-restore safety backup, rename, revalidation and rollback;
- rejects overlapping binary saves with the existing `false` result (no write executed); returns a precise `ok:false` busy error for concurrent backup/restore;
- **throws a retriable busy error** from `db:readBinary` and `db:exists` during restore, rather than giving `null` or `false` while the live database might be temporarily renamed;
- allows existing reads while a backup reservation is active, because the live database remains valid; preserves existing trusted-renderer checks, size limit, current backup formats and the already merged fsync-before-rename writer.

`packages/business-logic/src/__tests__/desktop-sqlite-ipc-gate.test.mjs` verifies two suspended concurrent operations over a real temporary file, ensures rejected writes do not execute, reads are never falsely empty during restore, a backup keeps the source stable across awaits, conflicting requests reject, and both fulfilled and failed reservations release correctly. It also enforces actual IPC source wiring through regression contract assertions.

## Explicit remaining limits

- This is **same Electron main-process arbitration**, NOT an OS-wide lock across independently running app processes, native file handles, antivirus interference, sync agents or external SQLite tools.
- A true single-instance/app lock and cross-process file access policy still need independent reviewed implementation. If a user runs two separate Electron processes pointing to the same userData path, this gate alone cannot prevent concurrency.
- The existing backup-restore temporary/rollback filenames are timestamp-based; unique recovery naming, power-loss-safe journal and idempotent failed restoration remain future work.
- The gate is intentionally fail-fast: write requests during backup/restore return false rather than transparently queuing potentially stale renderer snapshots. App-level feedback/retry handling should be validated in real Windows user flows.
- No HR005 holiday receipt hydration, Cloud-to-Offline authorization, device enrollment, customer SQL migration, HR004 payroll edits, new AI billing or release artifact produced. Windows/Hybrid UAT is required before a new customer installer. Stable customer release v1.0.15. Full Master Vision estimate about 51%, subject to whole-product evidence.

## Verification

Required: exact-head Web/Windows/typecheck/core-coverage/security CI, post-merge main CI, real Windows NTFS test with parallel tabs, concurrent manual/automatic backups and restores, abrupt shutdown, disk-full, file locks and app restart. Do not claim production-level multi-process serialization from unit tests alone.
