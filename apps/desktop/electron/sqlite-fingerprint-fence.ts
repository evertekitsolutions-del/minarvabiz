/**
 * Detects out-of-band changes to Minarva's full-image Windows SQLite file.
 * This is an optimistic snapshot fence, NOT an NTFS file/OS writer lock:
 * unrelated writers can still race the final rename between comparisons.
 *
 * The renderer saves complete SQL.js images, not individual SQL operations.
 * An image loaded earlier must never overwrite a different live image.
 */
import { createHash } from "node:crypto";

export class NativeSqliteExternalChangeError extends Error {
  constructor() {
    super("SQLite database changed outside this Minarva Biz window. Save refused to protect newer data. Restart only after reviewing other database writers and taking a verified backup.");
    this.name = "NativeSqliteExternalChangeError";
  }
}

function digest(image: Uint8Array | null): string {
  return image === null
    ? "absent"
    : "sha256:" + createHash("sha256").update(image).digest("hex");
}

export class NativeSqliteFingerprintFence {
  private expected: string | null = null;
  private compromised = false;
  private restartRequired = false;

  /** Bind the first trusted renderer read, then reject later external changes. */
  observeRead(image: Uint8Array | null): void {
    if (this.restartRequired) throw new Error("SQLite restore completed: restart Minarva Biz before reading or writing the restored database.");
    if (this.compromised) throw new NativeSqliteExternalChangeError();
    const actual = digest(image);
    if (this.expected === null) {
      this.expected = actual;
      return;
    }
    if (actual !== this.expected) {
      this.compromised = true;
      throw new NativeSqliteExternalChangeError();
    }
  }

  /** Called synchronously within the same-main-process SQLite write gate. */
  assertBeforeWrite(image: Uint8Array | null): void {
    if (this.restartRequired) throw new Error("SQLite restore completed: restart Minarva Biz before saving.");
    if (this.compromised || this.expected === null ||
        digest(image) !== this.expected) {
      this.compromised = true;
      throw new NativeSqliteExternalChangeError();
    }
  }

  /** Only advance the expected fingerprint when the native commit succeeded. */
  acceptCommittedImage(image: Uint8Array): void {
    if (this.restartRequired) throw new Error("SQLite restore completed: restart Minarva Biz before saving.");
    if (this.compromised || this.expected === null) throw new NativeSqliteExternalChangeError();
    this.expected = digest(image);
  }

  /** Never let the existing renderer overwrite a newly restored full image. */
  requireRestartAfterRestore(): void {
    this.expected = null;
    this.restartRequired = true;
  }
}
