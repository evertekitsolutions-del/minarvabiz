/**
 * B1 native-only signed revocation journal: staging, never renderer/IPC.
 * Files are immutable; stale locks and broken records fail closed.
 * A separate durable, rollback-resistant native anchor is required for
 * every accepted sequence. No anchor implementation is bundled here:
 * the host MUST supply one whose integrity does not depend on userData.
 * Never expose the trust anchor or this store to renderer IPC.
 */
import { promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { verifyNativeSyncRevocations, type VerifiedSyncRevocationSnapshot } from "./sync-revocations.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENTRY = /^snapshot-([0-9]{16})\.json$/;
const PENDING = /^\.pending-[a-f0-9-]{36}$/;
const MAX_BYTES = 140_000;
const MAX_RECORDS = 10_000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Must be stored outside the writable journal in OS-protected native storage. */
export interface TrustedRevocationAnchor {
  readonly sequence: number;
  readonly tokenSha256: string | null;
  readonly acceptedAtMs: number;
}
export interface NativeRevocationAnchorStore {
  /** Return {sequence:0,tokenSha256:null,acceptedAtMs:0} only for first enrollment. */
  read(): Promise<TrustedRevocationAnchor>;
  /** Resolve ONLY after a verified durable/rollback-resistant commit. */
  write(next: TrustedRevocationAnchor): Promise<void>;
}
export interface NativeRevocationStoreTrust {
  readonly userData: string;
  readonly anchor: NativeRevocationAnchorStore;
  readonly expectedOrgId: string;
  readonly expectedDeviceId: string;
  readonly trustedKeyId: string;
  readonly pinnedEd25519PublicKeyHex: string;
  /** Only trusted native callers can supply the clock. */
  readonly nowMs: () => number;
}
interface Stored {
  version: 1;
  sequence: number;
  acceptedAtMs: number;
  sha256: string;
  token: string;
}
function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function nameFor(sequence: number): string {
  return "snapshot-" + String(sequence).padStart(16, "0") + ".json";
}
function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
function checkAnchor(anchor: TrustedRevocationAnchor, stored: Stored | null): void {
  if (!anchor || !integer(anchor.sequence) || !integer(anchor.acceptedAtMs) ||
      (anchor.sequence === 0 && (anchor.tokenSha256 !== null || anchor.acceptedAtMs !== 0)) ||
      (anchor.sequence > 0 && (typeof anchor.tokenSha256 !== "string" ||
       !/^[a-f0-9]{64}$/.test(anchor.tokenSha256)))) {
    throw Error("b1_anchor_untrusted: Invalid native anchor");
  }
  if (!stored) {
    if (anchor.sequence !== 0) throw Error("b1_state_rollback: Missing anchored snapshot");
    return;
  }
  if (anchor.sequence !== stored.sequence ||
      anchor.tokenSha256 !== stored.sha256 ||
      anchor.acceptedAtMs !== stored.acceptedAtMs) {
    throw Error("b1_state_rollback: Journal diverges from durable anchor");
  }
}
function parse(raw: string, expectedSequence: number): Stored {
  if (Buffer.byteLength(raw) > MAX_BYTES) throw Error("b1_state_corrupt: oversized file");
  let value: unknown;
  try { value = JSON.parse(raw) as unknown; }
  catch { throw Error("b1_state_corrupt: invalid JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw Error("b1_state_corrupt: invalid record");
  }
  const v = value as Record<string, unknown>;
  const keys = ["version","sequence","acceptedAtMs","sha256","token"];
  if (Object.keys(v).length !== keys.length ||
      keys.some(k => !Object.prototype.hasOwnProperty.call(v, k)) ||
      v.version !== 1 || !integer(v.sequence) || v.sequence !== expectedSequence ||
      !integer(v.acceptedAtMs) || typeof v.token !== "string" ||
      typeof v.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(v.sha256) ||
      sha256(v.token) !== v.sha256) {
    throw Error("b1_state_corrupt: invalid record integrity");
  }
  return v as unknown as Stored;
}
async function syncDirectory(dir: string): Promise<void> {
  // NTFS directory fsync is not guaranteed; Windows power-loss UAT is pending.
  if (process.platform === "win32") return;
  const h = await fs.open(dir, "r");
  try { await h.sync(); } finally { await h.close(); }
}
export function createNativeRevocationStore(trust: NativeRevocationStoreTrust) {
  if (!UUID.test(trust.expectedOrgId) || !UUID.test(trust.expectedDeviceId) ||
      !/^[a-f0-9]{64}$/i.test(trust.pinnedEd25519PublicKeyHex) ||
      typeof trust.nowMs !== "function" ||
      !trust.anchor || typeof trust.anchor.read !== "function" ||
      typeof trust.anchor.write !== "function") {
    throw Error("b1_untrusted_config: invalid native scope");
  }
  const dir = path.join(trust.userData, "b1-revocations",
    trust.expectedOrgId.toLowerCase() + "-" + trust.expectedDeviceId.toLowerCase());
  let pending: Promise<void> = Promise.resolve();
  function serialized<T>(fn: () => Promise<T>): Promise<T> {
    const result = pending.then(fn);
    pending = result.then(() => undefined, () => undefined);
    return result;
  }
  function verify(stored: Stored, now: number, lastClock: number): VerifiedSyncRevocationSnapshot {
    const result = verifyNativeSyncRevocations(stored.token, {
      trustedKeyId: trust.trustedKeyId,
      pinnedEd25519PublicKeyHex: trust.pinnedEd25519PublicKeyHex,
      expectedOrgId: trust.expectedOrgId,
      expectedDeviceId: trust.expectedDeviceId,
      lastAcceptedSequence: stored.sequence - 1,
      lastTrustedClockMs: lastClock,
      nowMs: now,
    });
    if (!result.ok || result.snapshot.sequence !== stored.sequence) {
      throw Error("b1_state_untrusted: signed proof invalid");
    }
    return result.snapshot;
  }
  async function load(underWriterLock = false): Promise<Stored | null> {
    let entries: string[];
    try {
      const stat = await fs.lstat(dir);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw Error("b1_state_corrupt: journal directory is not trusted");
      entries = await fs.readdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    if (entries.includes("writer.lock") && !underWriterLock)
      throw Error("b1_state_locked: writer lock requires explicit recovery");
    const names: string[] = [];
    for (const filename of entries) {
      if (filename === "writer.lock" && underWriterLock) continue;
      const match = ENTRY.exec(filename);
      if (match) {
        const seq = Number(match[1]);
        if (!Number.isSafeInteger(seq) || seq < 1 || filename !== nameFor(seq))
          throw Error("b1_state_corrupt: invalid sequence filename");
        names.push(filename);
      } else if (!PENDING.test(filename)) {
        throw Error("b1_state_corrupt: unexpected journal entry");
      }
    }
    if (names.length > MAX_RECORDS) throw Error("b1_state_corrupt: journal limit reached");
    if (names.length === 0) return null;
    names.sort();
    const latest = names[names.length - 1];
    const seq = Number(ENTRY.exec(latest)?.[1]);
    const filename = path.join(dir, latest);
    const stat = await fs.lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES)
      throw Error("b1_state_corrupt: unsafe journal file");
    const stored = parse(await fs.readFile(filename, "utf8"), seq);
    // Validate signature at time of acceptance, even if now expired.
    verify(stored, stored.acceptedAtMs, stored.acceptedAtMs);
    return stored;
  }

  /** Restart restores only currently unexpired, native-verified signed state. */
  async function recover(): Promise<VerifiedSyncRevocationSnapshot | null> {
    return serialized(async () => {
      const state = await load();
      checkAnchor(await trust.anchor.read(), state);
      if (!state) return null;
      const now = trust.nowMs();
      if (!integer(now) || now + CLOCK_SKEW_MS < state.acceptedAtMs)
        throw Error("b1_clock_untrusted: clock rollback");
      return verify(state, now, state.acceptedAtMs);
    });
  }

  /** Signed new sequence only; no overwrite or unauthenticated recovery. */
  async function accept(token: string): Promise<VerifiedSyncRevocationSnapshot> {
    return serialized(async () => {
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      const dirStat = await fs.lstat(dir);
      if (!dirStat.isDirectory() || dirStat.isSymbolicLink())
        throw Error("b1_state_corrupt: unsafe journal path");
      const lockPath = path.join(dir, "writer.lock");
      const lock = await fs.open(lockPath, "wx", 0o600);
      let temp: string | null = null;
      try {
        const previous = await load(true);
        checkAnchor(await trust.anchor.read(), previous);
        const now = trust.nowMs();
        if (!integer(now) ||
            (previous !== null && now + CLOCK_SKEW_MS < previous.acceptedAtMs))
          throw Error("b1_clock_untrusted: clock rollback");
        const outcome = verifyNativeSyncRevocations(token, {
          trustedKeyId: trust.trustedKeyId,
          pinnedEd25519PublicKeyHex: trust.pinnedEd25519PublicKeyHex,
          expectedOrgId: trust.expectedOrgId,
          expectedDeviceId: trust.expectedDeviceId,
          lastAcceptedSequence: previous?.sequence ?? 0,
          lastTrustedClockMs: previous?.acceptedAtMs ?? 0,
          nowMs: now,
        });
        if (!outcome.ok) throw Error("b1_proof_rejected: " + outcome.code);
        if (previous) {
          // Revocations are one-way for this enrollment. A later signed
          // snapshot may add revocations, never silently clear an older one.
          // Fresh enrollment uses a different device identity and journal.
          const old = verify(previous, previous.acceptedAtMs, previous.acceptedAtMs);
          const credentials = new Set(outcome.snapshot.revokedCredentialIds);
          const branches = new Set(outcome.snapshot.revokedBranchIds);
          if (old.revokedCredentialIds.some(id => !credentials.has(id)) ||
              old.revokedBranchIds.some(id => !branches.has(id))) {
            throw Error("b1_proof_rejected: revocations must be monotonic");
          }
        }
        const stored: Stored = {
          version: 1, sequence: outcome.snapshot.sequence,
          acceptedAtMs: now, sha256: sha256(token), token,
        };
        const body = JSON.stringify(stored);
        if (Buffer.byteLength(body) > MAX_BYTES) throw Error("b1_state_corrupt: oversized record");
        temp = path.join(dir, ".pending-" + randomUUID());
        const h = await fs.open(temp, "wx", 0o600);
        try { await h.writeFile(body, "utf8"); await h.sync(); }
        finally { await h.close(); }
        // Hard-link never replaces a committed file. Failed publish leaves a
        // pending file that recovery ignores, without adopting its authority.
        await fs.link(temp, path.join(dir, nameFor(stored.sequence)));
        await syncDirectory(dir);
        // A committed journal entry is NOT usable authority until the
        // independent anchor also confirms it. On anchor write failure the
        // journal stays ahead: all later reads reject until explicit repair.
        await trust.anchor.write(Object.freeze({
          sequence: stored.sequence,
          tokenSha256: stored.sha256,
          acceptedAtMs: stored.acceptedAtMs,
        }));
        return outcome.snapshot;
      } finally {
        if (temp) await fs.unlink(temp).catch(error => {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        });
        await lock.close();
        await fs.unlink(lockPath);
      }
    });
  }
  return Object.freeze({ accept, recover });
}
