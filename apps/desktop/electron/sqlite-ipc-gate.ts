/**
 * OFFLINE-NATIVE-02: same-main-process SQLite IPC access fence.
 *
 * Async backup/restore validation yields while renderer IPC can attempt writes.
 * A reservation fences the entire snapshot or restore until all awaits settle.
 * The write IPC returns false when busy (no successful write was performed).
 * Reads during restore must throw, not return null (a false empty database).
 *
 * Not a cross-process lock. A native OS instance lock and NTFS power-loss
 * verification remain separate requirements.
 */
export type NativeSqliteReservation = "backup" | "restore";

export class NativeSqliteBusyError extends Error {
  constructor(active: NativeSqliteReservation) {
    super("SQLite " + active + " in progress; database operation must be retried");
    this.name = "NativeSqliteBusyError";
  }
}

export class NativeSqliteIpcGate {
  private active: NativeSqliteReservation | null = null;

  get activeReservation(): NativeSqliteReservation | null {
    return this.active;
  }

  async reserve<T>(
    kind: NativeSqliteReservation,
    callback: () => Promise<T> | T,
  ): Promise<T> {
    if (kind !== "backup" && kind !== "restore")
      throw new Error("Unrecognized SQLite reservation");
    if (this.active) throw new NativeSqliteBusyError(this.active);
    this.active = kind;
    try {
      return await callback();
    } finally {
      this.active = null;
    }
  }

  write(callback: () => boolean): boolean {
    if (this.active) return false;
    return callback();
  }

  read<T>(callback: () => T): T {
    if (this.active === "restore")
      throw new NativeSqliteBusyError("restore");
    return callback();
  }
}
