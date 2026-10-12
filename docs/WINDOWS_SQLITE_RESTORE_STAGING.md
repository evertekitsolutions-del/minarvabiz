# OFFLINE-NATIVE-04 — Exclusive durable restore staging

Restore previously used PID/millisecond filenames and copied the selected image without a file fsync before moving the live database. The ordinary binary-save hardening did not cover this separate restore path.

The production trusted restore IPC now calls `prepareSqliteRestoreStage` within the existing restore reservation, after the verified pre-restore safety backup. Node `mkdtempSync` reserves a unique directory beside the target, keeping staged and rollback images on the same volume. `COPYFILE_EXCL` refuses a preexisting staged destination. File fsync and close must succeed before the helper returns; existing Minarva schema validation must still pass before the live file is moved.

Failure before staging completes leaves the live database untouched and attempts to clean the temporary image. Final cleanup removes only the staged image and an empty workspace. It deliberately never recursively deletes a workspace holding a rollback image after rollback failure. Abrupt process termination may leave a workspace; automatic orphan deletion is not authorized by this change.

## Verification

`desktop-restore-staging.test.mjs` is discovered by the existing business-logic CI sweep. It reopens a real SQLite image, checks unique same-volume workspaces, fsync before returning, partial-copy/open/fsync/close faults, exclusive-copy collision, unchanged live bytes and preservation of a stranded rollback image. Production wiring assertions retain trusted IPC, full schema validation and the existing restore gate. Required PR and post-merge gates remain mandatory.

## Reuse and limits

Reuses the Minarva validation, safety backup, rollback and IPC reservation code plus built-in Node filesystem APIs; no third-party source or dependency added. Official API reference reviewed: https://nodejs.org/api/fs.html (`mkdtempSync`, `copyFileSync`, `COPYFILE_EXCL`, `fsyncSync`). File copy is not atomic, which is why copying is confined to isolated staging before validation and the existing rename sequence.

This is NOT crash-safe restore completion: the two-rename live/rollback switch still needs a durable recovery journal and fail-closed startup recovery. External native writers, directory metadata persistence, actual NTFS power loss, disk-full/antivirus locks, updater/multi-launch UAT and renderer retry UX remain unaccepted. Simulated IO faults are not real Windows UAT. HR005 server enrollment/issuance/APPLIED sequencing and hydration remain incomplete; production HR005 flag stays OFF. No migration, customer data change, installer publication or paid service. Full Master Vision estimate remains approximately 51%; customer release remains v1.0.15 until independently superseded.
