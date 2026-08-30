/**
 * Automatic backup settings + status (desktop uses SQLite file copy)
 */
import { generateId, nowISO } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { touchPersistence } from "./autosave";
import { auditAction } from "./audit-actions";

export interface AutoBackupSettings {
  enabled: boolean;
  intervalHours: number; // 24 = daily
  retentionCount: number;
  lastBackupAt: string | null;
  lastBackupPath: string | null;
  lastError: string | null;
}

export interface BackupMeta {
  id: string;
  path: string;
  createdAt: string;
  sizeBytes?: number;
  kind: "manual" | "auto" | "pre-restore" | "pre-migrate";
}

const settings: AutoBackupSettings = {
  enabled: true,
  intervalHours: 24,
  retentionCount: 14,
  lastBackupAt: null,
  lastBackupPath: null,
  lastError: null,
};

const history: BackupMeta[] = [];

export function getAutoBackupSettings(): AutoBackupSettings {
  return { ...settings };
}

export function setAutoBackupSettings(patch: Partial<AutoBackupSettings>) {
  assertPermission("backup.manage");
  Object.assign(settings, patch);
  touchPersistence();
}

export function listBackupHistory(): BackupMeta[] {
  return [...history].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function recordBackupSuccess(path: string, kind: BackupMeta["kind"], sizeBytes?: number) {
  const meta: BackupMeta = {
    id: generateId(),
    path,
    createdAt: nowISO(),
    sizeBytes,
    kind,
  };
  history.unshift(meta);
  while (history.length > Math.max(settings.retentionCount, 5) * 2) history.pop();
  settings.lastBackupAt = meta.createdAt;
  settings.lastBackupPath = path;
  settings.lastError = null;
  auditAction("backup.create", "backup", meta.id, null, meta);
  touchPersistence();
  return meta;
}

export function recordBackupFailure(error: string) {
  settings.lastError = error;
  touchPersistence();
}

export function shouldRunAutoBackup(): boolean {
  if (!settings.enabled) return false;
  if (!settings.lastBackupAt) return true;
  const last = new Date(settings.lastBackupAt).getTime();
  const ms = settings.intervalHours * 3600 * 1000;
  return Date.now() - last >= ms;
}

export function hydrateAutoBackup(data: {
  settings?: AutoBackupSettings;
  history?: BackupMeta[];
}) {
  if (data.settings) Object.assign(settings, data.settings);
  if (data.history) {
    history.length = 0;
    history.push(...data.history);
  }
}

export function exportAutoBackupState() {
  return { settings: { ...settings }, history: [...history] };
}
