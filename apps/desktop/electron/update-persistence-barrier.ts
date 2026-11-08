/**
 * P0: never launch a Windows upgrade while the renderer holds unsaved
 * product/stock/domain edits. A main-process backup of a stale SQLite file
 * is not sufficient if renderer persistence is still queued.
 */
import { randomUUID } from "node:crypto";
import type { IpcMain, IpcMainEvent, WebContents } from "electron";

export function confirmRendererPersistenceBeforeUpdate(
  ipc: Pick<IpcMain, "on" | "off">,
  sender: Pick<WebContents, "send" | "once" | "off" | "isDestroyed">,
  timeoutMs = 45_000,
): Promise<boolean> {
  if (sender.isDestroyed()) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const requestId = randomUUID();
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      ipc.off("update:flush-result", onResponse);
      sender.off("destroyed", onDestroyed);
      resolve(ok);
    };
    const onDestroyed = () => settle(false);
    const onResponse = (event: IpcMainEvent, receivedId: unknown, durable: unknown) => {
      if (event.sender !== sender || receivedId !== requestId) return;
      settle(durable === true);
    };
    ipc.on("update:flush-result", onResponse);
    sender.once("destroyed", onDestroyed);
    timer = setTimeout(() => settle(false), Math.max(1, timeoutMs));
    try {
      sender.send("update:flush-request", requestId);
    } catch {
      settle(false);
    }
  });
}
