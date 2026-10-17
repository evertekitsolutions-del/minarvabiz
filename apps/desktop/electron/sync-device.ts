/** Native financial-sync identity. No licensing identity or renderer input is used. */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Bind once to the main process userData directory; no process-wide storage aliasing. */
export function createDesktopSyncDeviceReader(userData: string): () => Promise<string> {
  const target = path.join(userData, "sync-device-id");
  let inFlight: Promise<string> | null = null;
  async function read(): Promise<string | null> {
    try {
      const value = (await fs.readFile(target, "utf8")).trim();
      if (!UUID.test(value)) throw new Error("persistence_corrupt: Invalid sync identity");
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  async function initialize(): Promise<string> {
    try {
      const existing = await read();
      if (existing !== null) return existing;
      const created = randomUUID();
      const temporary = `${target}.tmp-${randomUUID()}`;
      try {
        const handle = await fs.open(temporary, "wx", 0o600);
        try {
          await handle.writeFile(created, "utf8");
          await handle.sync();
        } finally {
          await handle.close();
        }
        // Publish an already-flushed inode without replacing an established ID.
        // Unlike rename, link fails with EEXIST when another initializer wins.
        // Unsupported filesystems fail closed; never fall back to overwriting.
        try {
          await fs.link(temporary, target);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        }
      } finally {
        await fs.unlink(temporary).catch(error => {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        });
      }
      const winner = await read();
      if (winner === null) throw new Error("Sync identity disappeared during initialization");
      return winner;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("persistence_corrupt:")) throw error;
      throw new Error("persistence_failed: Unable to initialize sync identity", { cause: error });
    }
  }
  return () => {
    if (inFlight) return inFlight;
    const flight = Promise.resolve().then(initialize).finally(() => {
      if (inFlight === flight) inFlight = null;
    });
    inFlight = flight;
    return flight;
  };
}
