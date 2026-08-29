/**
 * Preload — expose a narrow, typed API to the renderer.
 * SQLite binary I/O is primary persistence for offline Windows edition.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("minarvaDesktop", {
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  getPath: (name: string) => ipcRenderer.invoke("app:getPath", name),
  platform: process.platform,
  dbRead: () => ipcRenderer.invoke("db:read") as Promise<string | null>,
  dbWrite: (content: string) => ipcRenderer.invoke("db:write", content) as Promise<boolean>,
  getSqlitePath: () => ipcRenderer.invoke("db:getSqlitePath") as Promise<string>,
  readSqliteBinary: () => ipcRenderer.invoke("db:readBinary") as Promise<Uint8Array | null>,
  writeSqliteBinary: (data: Uint8Array) =>
    ipcRenderer.invoke("db:writeBinary", data) as Promise<boolean>,
  sqliteExists: () => ipcRenderer.invoke("db:exists") as Promise<boolean>,
  backupSqlite: (dest: string) => ipcRenderer.invoke("db:backupSqlite", dest) as Promise<boolean>,
});

export type MinarvaDesktopApi = {
  getVersion: () => Promise<string>;
  getPath: (name: string) => Promise<string | null>;
  platform: NodeJS.Platform;
  dbRead: () => Promise<string | null>;
  dbWrite: (content: string) => Promise<boolean>;
  getSqlitePath: () => Promise<string>;
  readSqliteBinary: () => Promise<Uint8Array | null>;
  writeSqliteBinary: (data: Uint8Array) => Promise<boolean>;
  sqliteExists: () => Promise<boolean>;
  backupSqlite: (dest: string) => Promise<boolean>;
};

declare global {
  interface Window {
    minarvaDesktop?: MinarvaDesktopApi;
  }
}
