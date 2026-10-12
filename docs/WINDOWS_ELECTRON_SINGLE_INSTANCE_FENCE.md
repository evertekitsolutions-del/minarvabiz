# OFFLINE-NATIVE-03 — Electron Process Ownership Fence for Windows SQLite

## Scope and root cause

The existing Minarva Biz desktop uses `minarvabiz.db` under Electron's profile-specific `userData`. PR #350 secured file-image atomic writes and PR #351 fenced concurrent backup/restore operations **inside one Electron main process**. Neither prevents *two independent Electron processes with the same application userData profile* from racing over the same SQLite file.

This milestone wires Electron's native `app.requestSingleInstanceLock()` into the existing actual main startup path, before `app.whenReady()` initializes any customer license, window, database, IPC bootstrap or sync state. A process that cannot acquire ownership calls `app.quit()` and never reaches the primary initialization path. The original owner registers a `second-instance` handler which restores a minimized existing window, shows and focuses it without creating a competing database writer.

## Changes and regression coverage

- `apps/desktop/electron/single-instance-owner.ts`: independently testable fail-closed lock registration, safe window activation and denied/error paths.
- `apps/desktop/electron/main.ts`: guarded `whenReady` startup; preserves trusted IPC, SQLite atomic writer and async backup/restore gate.
- `packages/business-logic/src/__tests__/desktop-single-instance-owner.test.mjs`: revoked/denied/exception locks reject second process, no second instance listener or bootstrap, minimized and normal window focus, missing/destroyed windows, failed window manager, plus real Electron main source-wiring assertions.

No new dependency, paid provider, customer database, production migration or Windows release is introduced.

## Scope boundary / operational risk

This limits **cooperating Electron app processes using the same app profile**. It is NOT a durable OS-native SQLite file/transaction lock. An external program, malicious process, independent Windows user account, alternate profile or network share can still write the SQLite file. The protection is not a substitute for SQLite transaction integrity or crash-safe restore validation. It does not activate HR-005 holiday device data sync, server receipts or production policy.

The single-instance behavior must be checked on an actual Windows 10/11 machine: simultaneous launch, app minimized, updater/restart, alternate user profile, file locks and app crash/recovery. Offline/hybrid support must remain intact. Publishing a new installer requires explicit release/UAT gates. Last confirmed published Windows installer `v1.0.15`; overall Master Vision ≈51%.

## Merge gates

Exact-head Web and Desktop CI, business-logic test sweep, Electron Windows packaging/deep smoke, security/coverage, then independently verified post-merge CI. An all-green source PR does not imply Windows production acceptance.
