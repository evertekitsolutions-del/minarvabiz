# OFFLINE-NATIVE-06 — Detect out-of-band Windows SQLite file changes

## Root cause and scope

The Windows renderer uses SQL.js complete-file snapshots. Before this change, the process could read Minarva's SQLite database and later overwrite it with an outdated in-memory image even if a **separate process** had modified, replaced, created or deleted the live database in between. In addition, the Electron `db:readBinary` IPC swallowed all I/O failures as `null`, risking interpretation of an inaccessible existing database as a new empty installation.

This source-only milestone introduces `NativeSqliteFingerprintFence`, a SHA-256 **whole-image optimistic consistency check**. The trusted main-process `db:readBinary` and `db:exists` requests bind the initial observed digest and reject later mismatches, including same-size or timestamp-preserving edits. A write is denied without an observed first read or if the live image differs; it compares both before staging and after staged SQLite validation **immediately before the atomic rename**. A successful write advances the expected digest. A denied, validation-failed or fsync-failed write never advances it. After a separately validated manual restore, all reads/writes through the old renderer are blocked until the existing desktop restore UI relaunches the app. The new process then establishes a new first-read fingerprint. Detected mismatches remain latched until a trusted rebase/restart.

I/O errors other than actual `ENOENT` are no longer swallowed by `db:readBinary`: an inaccessible/corrupt image cannot become a silent fresh database.

## Verification

`desktop-native-sqlite-fingerprint-fence.test.mjs` uses real SQL.js database file images and injected staged-fsync external modifications. It verifies authorized subsequent saves, same-length and restored-mtime changes, missing-first-file followed by unexpected creation, deletion of an observed image, failure persistence even after byte reversal, and a late external write made between staging and final rename. Static assertions require the actual Electron IPC wiring and error handling. Existing atomic writer and IPC-gate source assertions were updated without dropping their protections.

## Limitations and continuation

**This is NOT an operating-system file lock.** An unrelated writer may still race between the final fingerprint comparison and the rename; other processes are not forced to honor this fence. Fingerprints cannot detect a write-and-revert completed entirely between observations. Direct changes during backup/restore, Windows NTFS power-loss and antivirus/file-sharing semantics require their own lock strategy and real installed-app testing. Production multi-process file authority / native writer locking must remain a tracked blocker.

No migration, feature flag, HR-005 Cloud authorization, customer record write, change to the published installer or paid dependency. Source remains provider-neutral and offline-capable. The whole Master Vision estimate stays **approximately 51%**, with published Windows customer installer **v1.0.15** pending separate UAT and release authorization.