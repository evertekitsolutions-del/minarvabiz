# OFFLINE-NATIVE-01 — Windows SQLite Atomic File Durability

## Purpose
Fix the existing customer Windows SQLite write path rather than adding another inactive Holiday review wrapper. Before this milestone the trusted Electron `db:writeBinary` IPC wrote a temporary SQLite file, performed header validation, then renamed it, but used a timestamp-based temp name and did not synchronize the staged file to disk before rename. A crash or concurrent call could leave an incomplete staging image, a name collision, or a write acknowledged without attempted durable file synchronization.

## Implementation
`apps/desktop/electron/sqlite-native-atomic-write.ts` provides `writeValidatedSqliteBinaryAtomically` and is called directly by the already existing, trusted-renderer-validated and size-bounded IPC handler in `apps/desktop/electron/main.ts`.

- Stages within the *same directory* using exclusive creation (mode 0600) and a cryptographically random UUID filename.
- Writes the complete SQLite binary, `fsync`s and closes the staging file, validates the staged database using the **existing** SQLite header check, then atomically renames the complete image to the live path.
- Attempts to `fsync` the containing directory where the OS supports it. Some Windows/other filesystems cannot synchronize directory handles; this is **best effort**, not a guarantee of power-loss durability on every filesystem.
- Rejects data/validation/write/fsync/rename failures **before** the live rename and cleans up the temporary file. Once the rename succeeds it reports success even if directory synchronization is unsupported, rather than falsely telling the renderer to retry an already committed write.
- Does not change the existing SQLite schema, IPC capability, backup format, license checks, customer application commands or feature flags. Production customer data remains untouched in this change.

## Verification
`packages/business-logic/src/__tests__/desktop-native-sqlite-atomic-write.test.mjs` runs on the real `sql.js` SQLite engine:
- Complete valid database images commit and reopen; quick successive saves use distinct staging names.
- Short/invalid data and injected validation, disk-full, fsync and rename failures preserve the existing valid database unchanged and leave no abandoned staging file in the exception path.
- Injected unavailable directory fsync after an accepted rename does not cause a misleading failed result.
- A source contract verifies that production Electron IPC continues to authorize its renderer and uses the new tested writer.

## Outstanding limitations
This improves native file-image atomicity for all Offline/Hybrid customers, **but is not yet a distributed or multi-renderer single-writer protocol**. Backups/restores and cross-window writes can still race during asynchronous steps; these require a reviewed native write lock, crash-safe restore reservation and device-specific fencing. It does not integrate or authorize HR-005 holiday receipt staging/hydration or server-issued receipt sequences. Test on actual Windows NTFS, abrupt shutdown, low-disk and antivirus file locks before cutting a new installer. Preserve the last verified customer Windows installer `v1.0.15` pending release authorization and UAT. HR-005 migration/feature flag stay OFF.

Full Minarva Biz Master Vision remains approximately 51%; code/test success does not establish whole-product acceptance.
