/**
 * Electron main process — Offline / Hybrid Windows shell.
 * Security: contextIsolation, no nodeIntegration, sandboxed preload.
 */

import { app, BrowserWindow, dialog, ipcMain, shell, safeStorage } from "electron";
import * as path from "path";
import * as fs from "fs";
import { createHash, execFileSync, randomUUID } from "crypto";

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
function dataFilePath() { return path.join(app.getPath("userData"), "minarvabiz-db.json"); }
function deviceIdPath() { return path.join(app.getPath("userData"), "device-id"); }
function trialStatePath() { return path.join(app.getPath("userData"), "trial-state.bin"); }
function sqlitePath() { return path.join(app.getPath("userData"), "minarvabiz.db"); }
function backupDir() { return path.join(app.getPath("userData"), "backups"); }
function timestamp() { return new Date().toISOString().replace(/[:.]/g, "-"); }

type TrialRegistration = { email: string; phone: string; organizationName: string; address: string };
type StoredTrial = TrialRegistration & { activationId: string; deviceId: string; activatedAt: string; trialExpiresAt: string; lastSeenAt: string; synced: boolean };

function getDeviceId() {
  const file = deviceIdPath();
  try {
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
    const id = randomUUID(); fs.writeFileSync(file, id, "utf8"); return id;
  } catch { return `desktop-${process.platform}-${app.getVersion()}`; }
}

function getWindowsMachineGuid(): string | null {
  if (process.platform !== "win32") return null;
  try {
    const output = execFileSync("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"], { encoding: "utf8", windowsHide: true });
    const match = output.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i);
    return match?.[1]?.trim() || null;
  } catch { return null; }
}

function getTrialDeviceId(): string {
  const machineGuid = getWindowsMachineGuid();
  const basis = machineGuid ? `windows-machine-guid:${machineGuid.toLowerCase()}` : `installation-device-id:${getDeviceId()}`;
  return createHash("sha256").update(`minarvabiz-trial-v1:${basis}`, "utf8").digest("hex");
}

function readTrial(): StoredTrial | null {
  try {
    if (!fs.existsSync(trialStatePath()) || !safeStorage.isEncryptionAvailable()) return null;
    const encrypted = fs.readFileSync(trialStatePath());
    return JSON.parse(safeStorage.decryptString(encrypted)) as StoredTrial;
  } catch { return null; }
}
function writeTrial(value: StoredTrial) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("OS secure storage is unavailable");
  const encrypted = safeStorage.encryptString(JSON.stringify(value));
  const temp = `${trialStatePath()}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, encrypted); fs.renameSync(temp, trialStatePath());
}
function trialSnapshot() {
  const trial = readTrial();
  if (!trial) return { activated: false, status: "unactivated", daysRemaining: 0, trialStartedAt: null, trialExpiresAt: null, registration: null, synced: false };
  const currentDeviceId = getTrialDeviceId();
  const registration = { email: trial.email, phone: trial.phone, organizationName: trial.organizationName, address: trial.address };
  if (trial.deviceId !== currentDeviceId) return { activated: true, status: "invalid_device", daysRemaining: 0, trialStartedAt: trial.activatedAt, trialExpiresAt: trial.trialExpiresAt, registration, synced: trial.synced };
  const now = Date.now();
  const expires = new Date(trial.trialExpiresAt).getTime();
  const lastSeen = new Date(trial.lastSeenAt).getTime();
  if (!Number.isFinite(expires) || !Number.isFinite(lastSeen)) return { activated: true, status: "invalid_clock", daysRemaining: 0, trialStartedAt: trial.activatedAt, trialExpiresAt: trial.trialExpiresAt, registration, synced: trial.synced };
  if (now + 5 * 60 * 1000 < lastSeen) return { activated: true, status: "invalid_clock", daysRemaining: 0, trialStartedAt: trial.activatedAt, trialExpiresAt: trial.trialExpiresAt, registration, synced: trial.synced };
  const daysRemaining = Math.max(0, Math.ceil((expires - now) / 86400000));
  const status = daysRemaining > 0 ? "active" : "expired";
  try { writeTrial({ ...trial, lastSeenAt: new Date().toISOString() }); } catch { /* state remains readable even if refresh fails */ }
  return { activated: true, status, daysRemaining, trialStartedAt: trial.activatedAt, trialExpiresAt: trial.trialExpiresAt, registration, synced: trial.synced };
}
function createWindow() {
  const win = new BrowserWindow({ width: 1280, height: 800, minWidth: 1024, minHeight: 640, title: "Minarva Biz", show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
  win.once("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(({ url }: { url: string }) => { shell.openExternal(url); return { action: "deny" }; });
  if (isDev) win.loadURL(process.env.VITE_DEV_SERVER_URL || "http://localhost:5173");
  else win.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
}
function isValidSqliteFile(file: string) {
  try { const fd = fs.openSync(file, "r"); const header = Buffer.alloc(16); fs.readSync(fd, header, 0, 16, 0); fs.closeSync(fd); return header.toString("utf8") === "SQLite format 3\u0000"; }
  catch { return false; }
}
function copySqlite(source: string, destination: string) { fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(source, destination); return fs.statSync(destination).size; }
function createLocalBackup(kind: "manual" | "automatic") { const source = sqlitePath(); if (!fs.existsSync(source)) return null; fs.mkdirSync(backupDir(), { recursive: true }); const destination = path.join(backupDir(), `minarvabiz-${kind}-${timestamp()}.db`); return { path: destination, sizeBytes: copySqlite(source, destination) }; }
function pruneAutomaticBackups(retention = 14) { fs.mkdirSync(backupDir(), { recursive: true }); const files = fs.readdirSync(backupDir()).filter((f) => f.startsWith("minarvabiz-automatic-") && f.endsWith(".db")).map((name) => ({ name, time: fs.statSync(path.join(backupDir(), name)).mtimeMs })).sort((a, b) => b.time - a.time); for (const item of files.slice(retention)) { try { fs.unlinkSync(path.join(backupDir(), item.name)); } catch { /* ignore */ } } }

app.whenReady().then(() => {
  process.env.MINARVA_SQLITE_PATH = sqlitePath(); process.env.MINARVA_MODE = process.env.MINARVA_MODE || "production";
  fs.mkdirSync(app.getPath("userData"), { recursive: true }); createWindow();
  setTimeout(() => { try { const dir = backupDir(); fs.mkdirSync(dir, { recursive: true }); const latest = fs.readdirSync(dir).filter((f) => f.startsWith("minarvabiz-automatic-") && f.endsWith(".db")).map((f) => fs.statSync(path.join(dir, f)).mtimeMs).sort((a, b) => b - a)[0]; if (!latest || Date.now() - latest >= 24 * 3600 * 1000) { createLocalBackup("automatic"); pruneAutomaticBackups(); } } catch { /* backup must never prevent app startup */ } }, 3000);
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

ipcMain.handle("app:getVersion", () => app.getVersion());
ipcMain.handle("app:getPath", (_e: unknown, name: string) => { const allowed = ["userData", "documents", "desktop", "temp"] as const; if ((allowed as readonly string[]).includes(name)) return app.getPath(name as (typeof allowed)[number]); return null; });
ipcMain.handle("db:read", () => { try { const f = dataFilePath(); return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null; } catch { return null; } });
ipcMain.handle("db:write", (_e: unknown, content: string) => { const f = dataFilePath(); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content, "utf8"); return true; });
ipcMain.handle("db:sqlitePath", () => sqlitePath());
ipcMain.handle("db:backupSqlite", (_e: unknown, destPath: string) => { const src = sqlitePath(); if (!fs.existsSync(src)) return false; copySqlite(src, destPath); return true; });
ipcMain.handle("db:getSqlitePath", () => sqlitePath());
ipcMain.handle("app:getDeviceId", () => getDeviceId());
ipcMain.handle("app:getTrialDeviceId", () => getTrialDeviceId());
ipcMain.handle("db:readBinary", () => { try { return fs.existsSync(sqlitePath()) ? fs.readFileSync(sqlitePath()) : null; } catch { return null; } });
ipcMain.handle("db:writeBinary", (_e: unknown, data: Uint8Array | Buffer | number[]) => { const file = sqlitePath(), temp = `${file}.restore-${process.pid}-${Date.now()}`; fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(temp, Buffer.from(data)); if (!isValidSqliteFile(temp)) { fs.unlinkSync(temp); return false; } fs.renameSync(temp, file); return true; });
ipcMain.handle("db:exists", () => fs.existsSync(sqlitePath()));

ipcMain.handle("trial:getState", () => trialSnapshot());
ipcMain.handle("trial:activate", (_e: unknown, registration: TrialRegistration) => {
  const email = String(registration?.email || "").trim().toLowerCase(); const phone = String(registration?.phone || "").trim(); const organizationName = String(registration?.organizationName || "").trim(); const address = String(registration?.address || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[0-9+() .-]{6,50}$/.test(phone) || !organizationName || !address) return { ok: false, error: "Email, phone number, organization name, and address are required." };
  const existing = readTrial(); if (existing) return { ok: false, error: "This installation has already activated its trial." };
  const started = new Date(); const expires = new Date(started.getTime() + 30 * 86400000);
  const value: StoredTrial = { email, phone, organizationName, address, activationId: randomUUID(), deviceId: getTrialDeviceId(), activatedAt: started.toISOString(), trialExpiresAt: expires.toISOString(), lastSeenAt: started.toISOString(), synced: false };
  try { writeTrial(value); return { ok: true, state: trialSnapshot() }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
});
ipcMain.handle("trial:markSynced", () => { const trial = readTrial(); if (!trial) return false; try { writeTrial({ ...trial, synced: true }); return true; } catch { return false; } });

ipcMain.handle("backup:list", () => { fs.mkdirSync(backupDir(), { recursive: true }); return fs.readdirSync(backupDir()).filter((f) => f.endsWith(".db")).map((filename) => { const full = path.join(backupDir(), filename), stat = fs.statSync(full); const kind = filename.includes("-automatic-") ? "automatic" : "manual"; return { id: filename, filename, createdAt: stat.mtime.toISOString(), sizeBytes: stat.size, kind, verified: isValidSqliteFile(full), location: "local" }; }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); });
ipcMain.handle("backup:createManual", async () => { const source = sqlitePath(); if (!fs.existsSync(source)) return { ok: false, error: "SQLite database does not exist yet" }; const result = await dialog.showSaveDialog({ title: "Save Minarva Biz Backup", defaultPath: path.join(app.getPath("documents"), `minarvabiz-backup-${timestamp()}.db`), filters: [{ name: "Minarva Biz SQLite Backup", extensions: ["db"] }] }); if (result.canceled || !result.filePath) return { ok: false, cancelled: true }; try { const sizeBytes = copySqlite(source, result.filePath); return { ok: true, path: result.filePath, sizeBytes, filename: path.basename(result.filePath) }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; } });
ipcMain.handle("backup:export", async (_e: unknown, id: string) => { const source = path.join(backupDir(), path.basename(id)); if (!fs.existsSync(source) || !isValidSqliteFile(source)) return { ok: false, error: "Backup file is missing or invalid" }; const result = await dialog.showSaveDialog({ title: "Export Minarva Biz Backup", defaultPath: path.join(app.getPath("documents"), path.basename(source)), filters: [{ name: "Minarva Biz SQLite Backup", extensions: ["db"] }] }); if (result.canceled || !result.filePath) return { ok: false, cancelled: true }; try { const sizeBytes = copySqlite(source, result.filePath); return { ok: true, path: result.filePath, sizeBytes, filename: path.basename(result.filePath) }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; } });
ipcMain.handle("backup:createAutomatic", () => { try { const result = createLocalBackup("automatic"); if (!result) return { ok: false, error: "SQLite database does not exist yet" }; pruneAutomaticBackups(); return { ok: true, ...result, filename: path.basename(result.path) }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; } });
ipcMain.handle("backup:restoreFromFile", async () => { const result = await dialog.showOpenDialog({ title: "Restore Minarva Biz Backup", properties: ["openFile"], filters: [{ name: "Minarva Biz SQLite Backup", extensions: ["db"] }] }); if (result.canceled || !result.filePaths[0]) return { ok: false, cancelled: true }; const source = result.filePaths[0]; if (!isValidSqliteFile(source)) return { ok: false, error: "Selected file is not a valid SQLite database backup" }; try { const pre = createLocalBackup("automatic"), target = sqlitePath(), temp = `${target}.restore-${process.pid}-${Date.now()}`; copySqlite(source, temp); fs.renameSync(temp, target); return { ok: true, source, preRestoreBackup: pre?.path ?? null }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; } });
ipcMain.handle("app:relaunch", () => { app.relaunch(); app.exit(0); return true; });
