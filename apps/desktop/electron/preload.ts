/**
 * Preload — expose a narrow, typed API to the renderer.
 * SQLite binary I/O is primary persistence for offline Windows edition.
 */

import { contextBridge, ipcRenderer } from "electron";

export type TrialRegistration = {
  email: string;
  phone: string;
  organizationName: string;
  address: string;
};
export type TrialState = {
  activated: boolean;
  status: "unactivated" | "active" | "expired" | "invalid_clock" | "invalid_device";
  daysRemaining: number;
  trialStartedAt: string | null;
  trialExpiresAt: string | null;
  registration: TrialRegistration | null;
  synced: boolean;
};

export type DesktopLicenseState = {
  status: "unlicensed" | "active" | "grace" | "expired" | "invalid";
  plan: "trial" | "basic" | "professional" | "business" | "enterprise" | null;
  edition: "online" | "offline" | "hybrid" | null;
  features: Record<string, boolean> | null;
  daysRemaining: number | null;
  graceDaysRemaining: number | null;
  reason?: string;
  licenseId?: string;
  activationId?: string;
};

contextBridge.exposeInMainWorld("minarvaDesktop", {
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  getPath: (name: string) => ipcRenderer.invoke("app:getPath", name),
  platform: process.platform,
  dbRead: () => ipcRenderer.invoke("db:read") as Promise<string | null>,
  dbWrite: (content: string) => ipcRenderer.invoke("db:write", content) as Promise<boolean>,
  getSqlitePath: () => ipcRenderer.invoke("db:getSqlitePath") as Promise<string>,
  getDeviceId: () => ipcRenderer.invoke("app:getDeviceId") as Promise<string>,
  getTrialDeviceId: () => ipcRenderer.invoke("app:getTrialDeviceId") as Promise<string>,
  getTrialState: () => ipcRenderer.invoke("trial:getState") as Promise<TrialState>,
  activateTrial: (registration: TrialRegistration) => ipcRenderer.invoke("trial:activate", registration) as Promise<{ ok: boolean; error?: string; state?: TrialState }>,
  markTrialSynced: () => ipcRenderer.invoke("trial:markSynced") as Promise<boolean>,
  getLicenseState: () => ipcRenderer.invoke("license:getState") as Promise<DesktopLicenseState>,
  activateLicenseToken: (token: string) => ipcRenderer.invoke("license:activateToken", token) as Promise<DesktopLicenseState>,
  deactivateLicense: () => ipcRenderer.invoke("license:deactivate") as Promise<boolean>,
  readSqliteBinary: () => ipcRenderer.invoke("db:readBinary") as Promise<Uint8Array | null>,
  writeSqliteBinary: (data: Uint8Array) => ipcRenderer.invoke("db:writeBinary", data) as Promise<boolean>,
  sqliteExists: () => ipcRenderer.invoke("db:exists") as Promise<boolean>,
  backupSqlite: (dest: string) => ipcRenderer.invoke("db:backupSqlite", dest) as Promise<boolean>,
  listBackups: () => ipcRenderer.invoke("backup:list") as Promise<NativeBackupMeta[]>,
  createManualBackup: () => ipcRenderer.invoke("backup:createManual") as Promise<NativeBackupResult>,
  exportBackup: (id: string) => ipcRenderer.invoke("backup:export", id) as Promise<NativeBackupResult>,
  createAutomaticBackup: () => ipcRenderer.invoke("backup:createAutomatic") as Promise<NativeBackupResult>,
  restoreBackup: () => ipcRenderer.invoke("backup:restoreFromFile") as Promise<NativeRestoreResult>,
  relaunch: () => ipcRenderer.invoke("app:relaunch") as Promise<boolean>,
});

export type NativeBackupMeta = {
  id: string;
  filename: string;
  createdAt: string;
  sizeBytes: number;
  kind: "manual" | "automatic";
  verified: boolean;
  location: "local";
};
export type NativeBackupResult = { ok: boolean; path?: string; filename?: string; sizeBytes?: number; error?: string; cancelled?: boolean };
export type NativeRestoreResult = { ok: boolean; source?: string; preRestoreBackup?: string | null; error?: string; cancelled?: boolean };

export type MinarvaDesktopApi = {
  getVersion: () => Promise<string>;
  getPath: (name: string) => Promise<string | null>;
  platform: NodeJS.Platform;
  dbRead: () => Promise<string | null>;
  dbWrite: (content: string) => Promise<boolean>;
  getSqlitePath: () => Promise<string>;
  getDeviceId?: () => Promise<string>;
  getTrialDeviceId?: () => Promise<string>;
  getTrialState: () => Promise<TrialState>;
  activateTrial: (registration: TrialRegistration) => Promise<{ ok: boolean; error?: string; state?: TrialState }>;
  markTrialSynced: () => Promise<boolean>;
  getLicenseState: () => Promise<DesktopLicenseState>;
  activateLicenseToken: (token: string) => Promise<DesktopLicenseState>;
  deactivateLicense: () => Promise<boolean>;
  readSqliteBinary: () => Promise<Uint8Array | null>;
  writeSqliteBinary: (data: Uint8Array) => Promise<boolean>;
  sqliteExists: () => Promise<boolean>;
  backupSqlite: (dest: string) => Promise<boolean>;
  listBackups: () => Promise<NativeBackupMeta[]>;
  createManualBackup: () => Promise<NativeBackupResult>;
  exportBackup: (id: string) => Promise<NativeBackupResult>;
  createAutomaticBackup: () => Promise<NativeBackupResult>;
  restoreBackup: () => Promise<NativeRestoreResult>;
  relaunch: () => Promise<boolean>;
};

declare global {
  interface Window { minarvaDesktop?: MinarvaDesktopApi; }
}
