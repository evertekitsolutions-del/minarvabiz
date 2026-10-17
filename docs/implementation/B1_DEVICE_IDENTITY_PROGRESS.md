# B1 device identity implementation checkpoint

Baseline: `4cb82378ed01cde484b352a80d1df6cfbc50af6d`.

This is an implementation increment, not completed B1 authority or permission enforcement.
Keep the PR in draft. Do not enable financial replay or release this as completed B1.

## Implemented

- Shared UUID validation and single-flight initialization per persistence adapter.
- Native identity stored separately in `userData/sync-device-id`.
- Flushed temporary file published using an exclusive hard link: an existing identity is never overwritten by a concurrent initializer. Filesystems without hard-link support fail closed.
- Empty/corrupt files fail closed. Failure does not permanently cache a rejected promise.
- Trusted renderer IPC, primary-process ownership check, preload typing, and SQLite bootstrap wiring.
- Historical outbox IDs are preserved during snapshot hydration; licensing identity is not used for new desktop outbox events.
- Logout clears the current role before unavailable/throwing session storage can interrupt cleanup.
- Linux/Windows CI identity tests and bootstrap tests in the installed-dependency CI job.

## Local verification

- 12 focused tests passed: shared concurrency, independent storage scopes, corruption, failed persistence retry, native concurrent readers, restart, eight independent initializer processes, unavailable storage recovery, bootstrap failure before writes, legacy outbox preservation, logout without storage, logout when storage throws.
- Shared business-logic project TypeScript check passed using TypeScript 5.7.3 and local workspace dependency links.
- New native and shared identity modules passed strict TypeScript checks.
- Quality smoke, GitHub Actions hardening, and `git diff --check` passed.
- Full frozen workspace dependency installation was not completed in this environment. The initial broad suite attempt had 184 passes and 93 dependency-resolution failures. A subsequent attempt after installing minimal dependencies produced no complete test summary; it is not evidence of a passing full suite.
- Windows packaged runtime and power-loss durability are not verified locally. The new Windows workflow must pass before accepting native filesystem behavior.

## Remaining B1 work (not silently accepted as complete)

1. Authoritative enrollment/grant/revocation migration and tenant/RLS integration tests.
2. Signed local authority issuance/verification, tenant/actor/device binding, expiry, logout/scope changes, and existing offline proprietor transition. Do not replace the existing permission fallback without this complete transition.
3. Browser durable identity, enrollment transport, trusted destination, session generation checks, timeout and retry policy.
4. Domain mutation readiness gates for every producer and durable outbox sequence allocation; preflight alone does not provide atomic financial persistence.
5. Explicit legacy/restore recovery policy: no rewriting historical device IDs and no implicit authority adoption.
6. Complete build/typechecks, database replay and Windows UAT.

Rollback this increment by reverting its commit; preserve `sync-device-id` and all outbox history. No cloud schema or production data was changed. Older application code does not consume the new file. Do not remove it during rollback.


## 2026-10-17: tenant-scoped enrollment schema increment (draft, unreleased)

Added `supabase/migrations/20261017_b1_sync_device_enrollment.sql` to the
authoritative replay manifest. The new server-side registry records pending,
active, and revoked device enrollment, immutable actor/key binding, tenant-safe
branch grants, and an append-only audit trail. Requests require same-tenant
admin membership; ordinary authenticated sessions can only revoke, not approve
devices. Approval is reserved to a trusted backend principal. Separate
PostgreSQL E2E fixtures exercise actor/tenant isolation, role denial, branch
scoping, activation and irreversible revocation. CI workflow:
`.github/workflows/b1-device-authority-sql.yml`.

**NOT shipped:** A database row with status `active` is not proof of device
possession. No server currently issues or validates the signed enrollment
credential. No mutation route may accept these rows as authority. Do not deploy
the migration or enable financial replay until enrollment proof, credential
signing/verifying, runtime revocation checks, atomic sequence allocation,
replay and real Windows UAT pass. Review this schema with a fresh local DB,
CI, security reviewers and a rollback plan before hosted migration.

Rollback of schema-only incremental migration (if deployed in future) requires
first confirming no production device authority data exists, then reversing
dependent grants, audit objects, and enrollments in an explicitly approved
maintenance plan. Never drop recorded authority/audit rows blindly.

## 2026-10-17: native signed authority verifier (draft, disabled)

Added `apps/desktop/electron/sync-authority.ts` as a native-only,
unintegrated Ed25519 verification primitive, with
`scripts/desktop-sync-authority.test.mjs` and Linux/Windows CI coverage.

Protocol: `base64url(canonical-json).base64url(signature)`; the signature
signs `MINARVA-BIZ:B1:SYNC-DEVICE-AUTHORITY:v1:` concatenated with the
encoded body. Canonical JSON uses exactly the named keys/order defined
by the native verifier. Trust uses a separately pinned enrollment Ed25519
public key, never the license key. No signing private key is bundled.

Verification is fail-closed for noncanonical tokens, invalid signatures,
wrong trust key, org/device/actor/branch mismatches, revoked devices or
branches, duplicated or unsorted grants, lifetime expiry, stale
revocation evidence, and wall-clock rollback. Accepted authority
is an immutable, symbol-branded native result.

**Security boundary remains INCOMPLETE:** The verifier must never receive
renderer-provided trust anchors, expected identities, revocation sets or
clock evidence. It is intentionally NOT exposed by preload, not installed
into `permissions.ts`, and not used to authorize SQLite/cloud mutations.
Native signed enrollment issuance, authoritative key delivery, persistent
signed revocation snapshots, clock high-water persistence, proprietor
transition, and branch revalidation remain prerequisites to activation.
Offline revocation cannot be instantaneous without a network; proposed
seven-day freshness ceiling is not a guarantee of immediate revocation.

Verification status: exact-head CI still required. No release claim.


## 2026-10-17: staged native revocation anchor fencing

- Journal recovery now requires an independent `NativeRevocationAnchorStore` returning
  the last committed sequence, SHA-256 token digest, and acceptance timestamp.
  The anchor must be held **outside userData** in rollback-resistant native storage.
- A missing, older, same-sequence/different-hash, or malformed anchor is
  rejected. A journal entry ahead of the committed anchor also fails closed.
- Publication order: fsync new receipt -> exclusive hard-link -> sync directory
  (where supported) -> `anchor.write(...)` -> return verified snapshot.
  If anchor persistence fails, no authority is returned and a subsequent
  restart refuses the ahead-of-anchor journal until explicit trusted repair.
- Revocation lists are cumulative: later signed snapshots cannot remove
  credential or branch revocations previously committed for this device.
- Regression tests cover journal deletion, valid replacement at same sequence,
  failed anchor commit, malformed anchor, and attempts to un-revoke identities.

**UNRELEASED / SECURITY LIMIT:** This is a contract and staging module, not a
shipped protected credential store. No OS-backed anchor implementation, TPM
monotonic counter, enrollment credential issuance, or financial replay gate
has been installed. The in-memory test anchor establishes state-machine
behavior only and is not considered secure production storage. NTFS power-loss
durability remains an explicit Windows acceptance task.


## 2026-10-17: device proof-of-possession / challenge contract (draft)

- Added `apps/desktop/electron/sync-enrollment-proof.ts`: native-only
  Ed25519 challenge proof, domain separation, key match to the pending
  enrollment registry, strict canonical nonce/time/scope validation and
  a server verifier with atomic, single-use challenge consumption callback.
- `scripts/desktop-sync-enrollment-proof.test.mjs` covers valid challenge,
  concurrent replay denial, mismatched device/org/actor/branch, tampering,
  expired challenges, wrong registered keys and unavailable consumption.
- Extended the still-unapplied B1 migration with the private
  `sync_device_enrollment_challenges` table (5 minute TTL), canonical
  base64url 32-byte nonces, tenant/actor/branch keys, no anon/auth grants,
  pending-device guard, and `private.b1_consume_sync_enrollment_challenge`
  for service_role-only atomic challenge consumption.
- Added disposable PostgreSQL checks for challenge one-time use, wrong
  nonce denial, and authenticated role isolation.

**IMPORTANT:** A cryptographic proof does not authorize the device or issue
credentials by itself. The backend must bind the challenge to an authenticated
session, verify proof against the pending DB record, consume it atomically,
and then issue a signed authority credential only after its own trust checks.
No signing service, credential issuance API, desktop registration IPC,
offline replay switch, production migration, or OS protected signing-key
persistence has been enabled. This is an isolated acceptance increment.


## 2026-10-17: server-only signed authority issuer protocol (draft)

- `apps/web/src/lib/b1-sync-authority-issuer.server.ts` issues
  domain-separated Ed25519 tokens in the **exact** canonical serialization
  already required by the native verifier. Its private key and pinned verifier
  are supplied by a privileged caller; it loads no environment variables.
- Strict checks bind signing key, key ID, tenant/device/actor, exact sorted
  branch grants, approved role enum, short server issuance window and
  expiry (maximum 30 days). Wrong keys or backdated credentials fail closed.
- `packages/business-logic/src/__tests__/b1-server-authority-signing.test.mjs`
  exercises the genuine native verifier with a separately verified signed
  revocation snapshot, plus key/role/scope/timestamp forgery rejection.
  The existing installed-dependency CI desktop job discovers this test file.

**STAGING ONLY:** Signing is not enrollment authorization. A later private
backend must authenticate the session, verify proof of device key ownership,
atomically consume its challenge, check current membership/branch status,
persist an issuance audit and use a trusted signing key before calling this
function. This draft has **no API route and no issuer key distribution**.
Production sync, financial writes, Windows release and database deployment
remain disabled pending end-to-end acceptance.
