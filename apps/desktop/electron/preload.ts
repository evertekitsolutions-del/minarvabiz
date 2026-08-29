/**
 * Preload — expose a narrow, typed API to the renderer.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("minarvaDesktop", {
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  getPath: (name: string) => ipcRenderer.invoke("app:getPath", name),
  platform: process.platform,
});

export type MinarvaDesktopApi = {
  getVersion: () => Promise<string>;
  getPath: (name: string) => Promise<string | null>;
  platform: NodeJS.Platform;
};

declare global {
  interface Window {
    minarvaDesktop?: MinarvaDesktopApi;
  }
}
