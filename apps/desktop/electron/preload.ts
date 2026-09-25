/**
 * Preload — expose a narrow, typed API to the renderer.
 * SQLite binary I/O is primary persistence for offline Windows edition.
 */

import { contextBridge, ipcRenderer } from "electron";

const MAX_SQLITE_IPC_BYTES = 256 * 1024 * 1024;
const MAX_LICENSE_TOKEN_CHARS = 64 * 1024;
const MAX_LICENSE_PACKAGE_CHARS = 256 * 1024;

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

function invalidLicenseState(reason: string): DesktopLicenseState {
  return { status: "invalid", plan: null, edition: null, features: null, daysRemaining: null, graceDaysRemaining: null, reason };
}

contextBridge.exposeInMainWorld("minarvaDesktop", {
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  platform: process.platform,
  getDeviceId: () => ipcRenderer.invoke("app:getDeviceId") as Promise<string>,
  getTrialState: () => ipcRenderer.invoke("trial:getState") as Promise<TrialState>,
  activateTrial: (registration: TrialRegistration) => ipcRenderer.invoke("trial:activate", registration) as Promise<{ ok: boolean; error?: string; state?: TrialState }>,
  markTrialSynced: () => ipcRenderer.invoke("trial:markSynced") as Promise<boolean>,
  getLicenseState: () => ipcRenderer.invoke("license:getState") as Promise<DesktopLicenseState>,
  activateLicenseToken: (token: string) => {
    if (typeof token !== "string" || token.length > MAX_LICENSE_TOKEN_CHARS) return Promise.resolve(invalidLicenseState("License token is too large"));
    return ipcRenderer.invoke("license:activateToken", token) as Promise<DesktopLicenseState>;
  },
  activateLicensePackage: (content: string) => {
    if (typeof content !== "string" || content.length > MAX_LICENSE_PACKAGE_CHARS) return Promise.resolve(invalidLicenseState("Offline license package is too large"));
    return ipcRenderer.invoke("license:activatePackage", content) as Promise<DesktopLicenseState>;
  },
  deactivateLicense: () => ipcRenderer.invoke("license:deactivate") as Promise<boolean>,
  readSqliteBinary: () => ipcRenderer.invoke("db:readBinary") as Promise<Uint8Array | null>,
  writeSqliteBinary: (data: Uint8Array) => {
    if (!(data instanceof Uint8Array) || data.byteLength === 0 || data.byteLength > MAX_SQLITE_IPC_BYTES) return Promise.resolve(false);
    return ipcRenderer.invoke("db:writeBinary", data) as Promise<boolean>;
  },
  sqliteExists: () => ipcRenderer.invoke("db:exists") as Promise<boolean>,
  listBackups: () => ipcRenderer.invoke("backup:list") as Promise<NativeBackupMeta[]>,
  createManualBackup: () => ipcRenderer.invoke("backup:createManual") as Promise<NativeBackupResult>,
  exportBackup: (id: string) => ipcRenderer.invoke("backup:export", id) as Promise<NativeBackupResult>,
  createAutomaticBackup: () => ipcRenderer.invoke("backup:createAutomatic") as Promise<NativeBackupResult>,
  chooseBackupDirectory: () => ipcRenderer.invoke("backup:chooseDestination") as Promise<string | null>,
  pruneAutomaticBackups: (retention?: number) => ipcRenderer.invoke("backup:pruneAutomatic", retention) as Promise<boolean>,
  restoreBackup: () => ipcRenderer.invoke("backup:restoreFromFile") as Promise<NativeRestoreResult>,
  listPrinters: () => ipcRenderer.invoke("printer:list") as Promise<Array<{ name: string; displayName: string; description: string; status: number; isDefault: boolean }>>,
  printHtml: (input: { html: string; deviceName?: string | null; paper?: "a4" | "thermal" | "label"; thermalWidthMm?: number; labelWidthMm?: number; labelHeightMm?: number; silent?: boolean }) => ipcRenderer.invoke("printer:printHtml", input) as Promise<{ ok: boolean; error?: string }>,
  checkForUpdates: () => ipcRenderer.invoke("update:check") as Promise<UpdateCheckResult>,
  downloadUpdate: () => ipcRenderer.invoke("update:download") as Promise<UpdateDownloadResult>,
  installUpdate: () => ipcRenderer.invoke("update:install") as Promise<{ ok: boolean; version?: string; backupPath?: string; error?: string }>,
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

export type UpdateCheckResult = { status: "disabled" | "up_to_date" | "available" | "error"; currentVersion: string; version?: string; publishedAt?: string; notes?: string; error?: string };
export type UpdateDownloadResult = { ok: boolean; version?: string; installerPath?: string; error?: string };

export type MinarvaDesktopApi = {
  getVersion: () => Promise<string>;
  platform: NodeJS.Platform;
  getDeviceId?: () => Promise<string>;
  getTrialState: () => Promise<TrialState>;
  activateTrial: (registration: TrialRegistration) => Promise<{ ok: boolean; error?: string; state?: TrialState }>;
  markTrialSynced: () => Promise<boolean>;
  getLicenseState: () => Promise<DesktopLicenseState>;
  activateLicenseToken: (token: string) => Promise<DesktopLicenseState>;
  activateLicensePackage: (content: string) => Promise<DesktopLicenseState>;
  deactivateLicense: () => Promise<boolean>;
  readSqliteBinary: () => Promise<Uint8Array | null>;
  writeSqliteBinary: (data: Uint8Array) => Promise<boolean>;
  sqliteExists: () => Promise<boolean>;
  listBackups: () => Promise<NativeBackupMeta[]>;
  createManualBackup: () => Promise<NativeBackupResult>;
  exportBackup: (id: string) => Promise<NativeBackupResult>;
  createAutomaticBackup: () => Promise<NativeBackupResult>;
  chooseBackupDirectory: () => Promise<string | null>;
  pruneAutomaticBackups: (retention?: number) => Promise<boolean>;
  restoreBackup: () => Promise<NativeRestoreResult>;
  listPrinters: () => Promise<Array<{ name: string; displayName: string; description: string; status: number; isDefault: boolean }>>;
  printHtml: (input: { html: string; deviceName?: string | null; paper?: "a4" | "thermal" | "label"; thermalWidthMm?: number; labelWidthMm?: number; labelHeightMm?: number; silent?: boolean }) => Promise<{ ok: boolean; error?: string }>;
  checkForUpdates: () => Promise<UpdateCheckResult>;
  downloadUpdate: () => Promise<UpdateDownloadResult>;
  installUpdate: () => Promise<{ ok: boolean; version?: string; backupPath?: string; error?: string }>;
  relaunch: () => Promise<boolean>;
};

declare global {
  interface Window { minarvaDesktop?: MinarvaDesktopApi; }
}
