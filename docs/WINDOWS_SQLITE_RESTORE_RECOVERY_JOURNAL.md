# OFFLINE-NATIVE-05 — Restore journal and startup recovery

This is a **source-only** follow-up to OFFLINE-NATIVE-01 through 04. No feature flag, customer data, hosted migration, service or published installer is changed.

## Problem and startup rules

The existing Windows Electron restore uses two filesystem renames: live database -> rollback, then staged backup -> live. Process termination between these operations can leave `minarvabiz.db` missing even though the previous valid image survives in the dedicated restore workspace. Starting the renderer then risks initializing a new database or hiding the surviving customer records.

The restore now creates and fsyncs an exclusive `restore-journal.json` in the same-volume private workspace **before** the first live image rename. It contains only a version, expected target basename and whether a live image existed, not customer records, secrets or arbitrary filesystem paths. Existing copy/fsync, full schema validation, exclusive IPC reservation and pre-restore safety backups remain in place. On successful restore, the marker is removed only when no stranded rollback image remains. After an unsuccessful restore, marker cleanup happens only when the original database was left intact or verified rolled back. Neither cleanup nor startup recursively erases incomplete workspaces.

Before creating any Electron renderer, startup inspects **all** same-volume restore workspaces. For one valid journal with missing live database, verified prior rollback is moved into place and revalidated. This is the ONLY automatic database replacement, and it does not overwrite a surviving database. A surviving valid live image is kept as-is; any rollback evidence is retained and subsequent manual restores are disabled pending review. A completely **empty** workspace without a journal is harmless evidence of crash between successful journal cleanup and empty-directory removal; it is ignored without deleting anything. Any **nonempty** missing/malformed journal, multiple workspaces, symlinks, invalid live/rollback, missing rollback, unexpected state or failed rename causes a fail-closed startup with an actionable error. A recovery failure never clears or installs a staged backup.

The old release could leave a journal-less workspace after interruption. It is **not safe to infer** its history; startup deliberately blocks for manual review instead of guessing or automatically deleting it.

## Acceptance and limits

The existing business-logic test sweep now covers startup ordering and required journal-before-rename wiring; crash between renames, crash after installing a valid backup, corrupt current image, corrupt rollback, wrong/missing journal, orphan evidence, no-original-database, multiple pending workspaces and journal symlink rejection. Validation is injected into the helper for isolated fault tests, while the production path uses the existing asynchronous Minarva schema validator. Separate OFFLINE-NATIVE-04 tests reopen a real SQLite file and verify staging/fsync. Run exact-head PR CI and post-merge CI independently.

This **does not** prove atomicity under real Windows NTFS sudden power loss; directory fsync remains best effort on unsupported Windows filesystems. It does not solve cross-process/external-writer locking, renderer retry, updater interoperability, actual installed Windows UAT, fault-injection against NTFS/antivirus/low disk, device-scoped HR005 signing authority, transactional APPLIED state or Cloud/Offline synchronization. Any blocked recovery requires a trusted operator with a preserved copy of the entire userData directory; do **not** casually delete .minarva-restore-* or manually replace the DB without validated customer backups.

No new library was copied: only the existing Minarva staging/schema/IPC APIs and Node built-in filesystem APIs are reused. Full Master Vision remains approximately **51%** and latest published Windows installer remains **v1.0.15** until separately verified.