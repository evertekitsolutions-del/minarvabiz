/**
 * Preload — expose a narrow, typed API to the renderer.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("minarvaDesktop", {
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  getPath: (name: string) => ipcRenderer.invoke("app:getPath", name),
  platform: process.platform,
  dbRead: () => ipcRenderer.invoke("db:read") as Promise<string | null>,
  dbWrite: (content: string) => ipcRenderer.invoke("db:write", content) as Promise<boolean>,
});

export type MinarvaDesktopApi = {
  getVersion: () => Promise<string>;
  getPath: (name: string) => Promise<string | null>;
  platform: NodeJS.Platform;
  dbRead: () => Promise<string | null>;
  dbWrite: (content: string) => Promise<boolean>;
};

declare global {
  interface Window {
    minarvaDesktop?: MinarvaDesktopApi;
  }
}
