import { app, BrowserWindow, Menu, dialog, ipcMain, shell, safeStorage, session } from "electron";
import * as path from "path";
import * as fs from "fs";
import { createHash, randomUUID } from "crypto";
import { execFileSync, spawn } from "child_process";
import { pathToFileURL } from "url";
import { registerDesktopLicenseIpc, getDesktopLicenseState } from "./license";
import { checkForSecureUpdate, downloadVerifiedUpdate, getDownloadedVerifiedUpdate } from "./updater";
import { minarvaBackupSchemaError } from "./sqlite-backup-validation";

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const runtimeSmoke = process.env.MINARVA_RUNTIME_SMOKE === "1";
const MAX_SQLITE_IPC_BYTES = 256 * 1024 * 1024;
const MAX_TRIAL_EMAIL_CHARS = 254;
const MAX_TRIAL_PHONE_CHARS = 50;
const MAX_TRIAL_ORG_CHARS = 200;
const MAX_TRIAL_ADDRESS_CHARS = 2000;
const MAX_BACKUP_ID_CHARS = 255;
const MAX_PRINT_HTML_CHARS = 2_000_000;
const MAX_PRINTER_DEVICE_CHARS = 256;
function deviceIdPath() { return path.join(app.getPath("userData"), "device-id"); }
function trialStatePath() { return path.join(app.getPath("userData"), "trial-state.bin"); }
function sqlitePath() { return path.join(app.getPath("userData"), "minarvabiz.db"); }
function backupDir() { return path.join(app.getPath("userData"), "backups"); }
function backupDestinationConfigPath() { return path.join(app.getPath("userData"), "backup-destination.txt"); }
function configuredBackupDir(): string | null { try { const value = fs.readFileSync(backupDestinationConfigPath(), "utf8").trim(); return value ? path.resolve(value) : null; } catch { return null; } }
function backupDestinationDir() { const configured = configuredBackupDir(); if (configured) return configured; if (process.platform === "win32" && fs.existsSync("D:/")) return path.join("D:\\", "Minarva Biz Backups"); return backupDir(); }
function runtimeSmokeLog(message: string) { if (!runtimeSmoke) return; try { fs.mkdirSync(app.getPath("userData"), { recursive: true }); fs.appendFileSync(path.join(app.getPath("userData"), "runtime-smoke.log"), `${new Date().toISOString()} ${message}\n`, "utf8"); } catch {} }
function timestamp() { return new Date().toISOString().replace(/[:.]/g, "-"); }
function configuredDevServerUrl() { return process.env.VITE_DEV_SERVER_URL || "http://localhost:5173"; }
function isTrustedRendererUrl(rawUrl: string): boolean {
  try {
    const actual = new URL(rawUrl);
    if (app.isPackaged) {
      actual.hash = "";
      actual.search = "";
      return actual.href === pathToFileURL(path.join(app.getAppPath(), "dist", "index.html")).href;
    }
    const expected = new URL(configuredDevServerUrl());
    return actual.protocol === expected.protocol && actual.host === expected.host;
  } catch {
    return false;
  }
}
function isTrustedRenderer(event: Electron.IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame;
  return Boolean(frame && frame === event.sender.mainFrame && isTrustedRendererUrl(frame.url));
}
function requireTrustedRenderer(event: Electron.IpcMainInvokeEvent) { if (!isTrustedRenderer(event)) throw new Error("Unauthorized IPC sender"); }
function allowedExternalHosts(): Set<string> {
  return new Set(String(process.env.MINARVA_EXTERNAL_URL_HOSTS || "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean));
}
function isAllowedExternalUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return false;
    return allowedExternalHosts().has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
function openAllowedExternalUrl(rawUrl: string) {
  if (!isAllowedExternalUrl(rawUrl)) {
    runtimeSmokeLog(`external-url-blocked url=${rawUrl}`);
    return;
  }
  void shell.openExternal(rawUrl).catch((error) => runtimeSmokeLog(`external-url-open-failed url=${rawUrl} error=${error instanceof Error ? error.message : String(error)}`));
}

function isDevServerRequest(url: URL): boolean {
  if (!isDev) return false;
  try {
    const expected = new URL(configuredDevServerUrl());
    if (url.host !== expected.host) return false;
    const websocketProtocol = expected.protocol === "https:" ? "wss:" : "ws:";
    return url.protocol === expected.protocol || url.protocol === websocketProtocol;
  } catch {
    return false;
  }
}
function isAllowedSessionRequest(rawUrl: string, resourceType: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (["file:", "data:", "blob:", "about:"].includes(url.protocol)) return true;
    if (isDevServerRequest(url)) return true;
    if (resourceType === "xhr") {
      if (url.protocol === "https:") return true;
      if (isDev && url.protocol === "http:") return true;
    }
    return false;
  } catch {
    return false;
  }
}
function configureDesktopSession() {
  const desktopSession = session.defaultSession;
  desktopSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    runtimeSmokeLog(`permission-request-denied permission=${permission}`);
    callback(false);
  });
  desktopSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    runtimeSmokeLog(`permission-check-denied permission=${permission} origin=${requestingOrigin || "unknown"}`);
    return false;
  });
  desktopSession.setDevicePermissionHandler((details) => {
    runtimeSmokeLog(`device-permission-denied type=${details.deviceType} origin=${details.origin || "unknown"}`);
    return false;
  });
  desktopSession.setDisplayMediaRequestHandler((_request, callback) => {
    runtimeSmokeLog("display-media-request-denied");
    callback({});
  });
  desktopSession.webRequest.onBeforeRequest((details, callback) => {
    const allowed = isAllowedSessionRequest(details.url, details.resourceType);
    if (!allowed) runtimeSmokeLog(`remote-resource-blocked type=${details.resourceType} url=${details.url}`);
    callback({ cancel: !allowed });
  });
}

async function printHtmlDocument(input: {
  html: string;
  deviceName?: string | null;
  paper?: "a4" | "thermal";
  thermalWidthMm?: number;
}): Promise<{ ok: boolean; error?: string }> {
  const html = String(input?.html || "");
  if (!html || html.length > MAX_PRINT_HTML_CHARS) return { ok: false, error: "Print document is empty or too large" };
  const deviceName = String(input?.deviceName || "").trim();
  if (deviceName.length > MAX_PRINTER_DEVICE_CHARS) return { ok: false, error: "Printer name is too long" };
  const paper = input?.paper === "thermal" ? "thermal" : "a4";
  const thermalWidthMm = input?.thermalWidthMm === 58 ? 58 : 80;
  const win = new BrowserWindow({
    show: false,
    width: paper === "thermal" ? 460 : 900,
    height: 900,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, webviewTag: false, allowRunningInsecureContent: false, javascript: false },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  try {
    if (deviceName) {
      const printers = await win.webContents.getPrintersAsync();
      if (!printers.some((printer) => printer.name === deviceName)) {
        return { ok: false, error: `Configured printer was not found: ${deviceName}` };
      }
    }
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pageSize: Electron.WebContentsPrintOptions["pageSize"] =
      paper === "a4" ? "A4" : { width: thermalWidthMm * 1000, height: 297000 };
    return await new Promise((resolve) => {
      win.webContents.print({
        silent: true,
        printBackground: true,
        deviceName: deviceName || undefined,
        margins: { marginType: "none" },
        pageSize,
      }, (success, failureReason) => {
        resolve(success ? { ok: true } : { ok: false, error: failureReason || "Printer rejected the job" });
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

type TrialRegistration = { email: string; phone: string; organizationName: string; address: string };
type StoredTrial = TrialRegistration & { activationId: string; deviceId: string; activatedAt: string; trialExpiresAt: string; lastSeenAt: string; synced: boolean };

function getWindowsMachineGuid(): string | null { if (process.platform !== "win32") return null; try { const output = execFileSync("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"], { encoding: "utf8", windowsHide: true }); const match = output.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i); return match?.[1]?.trim() || null; } catch { return null; } }
function getDeviceId() { const machineGuid = getWindowsMachineGuid(); if (machineGuid) return createHash("sha256").update(`minarvabiz-trial-v1:windows-machine-guid:${machineGuid.toLowerCase()}`, "utf8").digest("hex"); const file = deviceIdPath(); try { if (fs.existsSync(file)) { const installationId = fs.readFileSync(file, "utf8").trim(); if (installationId) return createHash("sha256").update(`minarvabiz-trial-v1:installation-device-id:${installationId}`, "utf8").digest("hex"); } const id = randomUUID(); fs.writeFileSync(file, id, "utf8"); return createHash("sha256").update(`minarvabiz-trial-v1:installation-device-id:${id}`, "utf8").digest("hex"); } catch { return createHash("sha256").update(`minarvabiz-trial-v1:fallback:${process.platform}:${app.getVersion()}`, "utf8").digest("hex"); } }
function getTrialDeviceId(): string { return getDeviceId(); }
function readTrial(): StoredTrial | null { try { if (!fs.existsSync(trialStatePath()) || !safeStorage.isEncryptionAvailable()) return null; return JSON.parse(safeStorage.decryptString(fs.readFileSync(trialStatePath()))) as StoredTrial; } catch { return null; } }
function writeTrial(value: StoredTrial) { if (!safeStorage.isEncryptionAvailable()) throw new Error("OS secure storage is unavailable"); const encrypted = safeStorage.encryptString(JSON.stringify(value)); const temp = `${trialStatePath()}.tmp-${process.pid}-${Date.now()}`; fs.writeFileSync(temp, encrypted); fs.renameSync(temp, trialStatePath()); }
function trialSnapshot() { const trial = readTrial(); if (!trial) return { activated: false, status: "unactivated", daysRemaining: 0, trialStartedAt: null, trialExpiresAt: null, registration: null, synced: false }; const currentDeviceId = getTrialDeviceId(); const registration = { email: trial.email, phone: trial.phone, organizationName: trial.organizationName, address: trial.address }; if (trial.deviceId !== currentDeviceId) return { activated: true, status: "invalid_device", daysRemaining: 0, trialStartedAt: trial.activatedAt, trialExpiresAt: trial.trialExpiresAt, registration, synced: trial.synced }; const now = Date.now(), expires = new Date(trial.trialExpiresAt).getTime(), lastSeen = new Date(trial.lastSeenAt).getTime(); if (!Number.isFinite(expires) || !Number.isFinite(lastSeen) || now + 5 * 60 * 1000 < lastSeen) return { activated: true, status: "invalid_clock", daysRemaining: 0, trialStartedAt: trial.activatedAt, trialExpiresAt: trial.trialExpiresAt, registration, synced: trial.synced }; const daysRemaining = Math.max(0, Math.ceil((expires - now) / 86400000)); const status = daysRemaining > 0 ? "active" : "expired"; try { writeTrial({ ...trial, lastSeenAt: new Date().toISOString() }); } catch {} return { activated: true, status, daysRemaining, trialStartedAt: trial.activatedAt, trialExpiresAt: trial.trialExpiresAt, registration, synced: trial.synced }; }
async function verifyRendererReady(win: BrowserWindow) {
  if (!runtimeSmoke) return;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    if (win.isDestroyed()) return;
    try {
      const state = await win.webContents.executeJavaScript(`JSON.stringify({ready: document.documentElement.dataset.minarvaRendererReady === "true", error: document.documentElement.dataset.minarvaRendererError === "true", text: (document.body && document.body.innerText || "").slice(0, 500)})`, true);
      const parsed = JSON.parse(String(state)) as { ready?: boolean; error?: boolean; text?: string };
      runtimeSmokeLog(`renderer-state ready=${Boolean(parsed.ready)} error=${Boolean(parsed.error)} text=${String(parsed.text || "").replace(/\s+/g, " ").trim()}`);
      if (parsed.ready) return;
      if (parsed.error) return;
    } catch (error) {
      runtimeSmokeLog(`renderer-state-error=${error instanceof Error ? error.message : String(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  runtimeSmokeLog("renderer-ui-ready=false timeout");
}
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: "Minarva Biz",
    icon: path.join(app.getAppPath(), "dist", "minarva-biz-icon.svg"),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
    },
  });
  runtimeSmokeLog(`window-created preload=${path.join(__dirname, "preload.js")} appPath=${app.getAppPath()} userData=${app.getPath("userData")} sandbox=true`);
  win.webContents.on("did-finish-load", async () => {
    runtimeSmokeLog("did-finish-load");
    if (runtimeSmoke) {
      try {
        const bridgeReady = await win.webContents.executeJavaScript("Boolean(window.minarvaDesktop && typeof window.minarvaDesktop.getVersion === 'function')", true);
        runtimeSmokeLog(`bridge-ready=${bridgeReady}`);
        await verifyRendererReady(win);
      } catch (error) {
        runtimeSmokeLog(`bridge-ready=false error=${error instanceof Error ? error.message : String(error)}`);
      }
    }
  });
  win.webContents.on("dom-ready", () => runtimeSmokeLog("dom-ready"));
  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => runtimeSmokeLog(`did-fail-load code=${errorCode} description=${errorDescription} url=${validatedURL}`));
  win.webContents.on("render-process-gone", (_event, details) => runtimeSmokeLog(`render-process-gone reason=${details.reason} exitCode=${details.exitCode}`));
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => runtimeSmokeLog(`console level=${level} message=${message} line=${line} source=${sourceId}`));
  win.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
    runtimeSmokeLog("webview-attachment-blocked");
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (isTrustedRendererUrl(url)) return;
    event.preventDefault();
    runtimeSmokeLog(`navigation-blocked url=${url}`);
    openAllowedExternalUrl(url);
  });
  win.once("ready-to-show", () => {
    runtimeSmokeLog(`ready-to-show bridge=${win.webContents ? "renderer-ready" : "missing"}`);
    win.show();
  });
  win.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    runtimeSmokeLog(`window-open-denied url=${url}`);
    openAllowedExternalUrl(url);
    return { action: "deny" };
  });
  if (isDev) win.loadURL(configuredDevServerUrl());
  else win.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
}
function sqliteValidationError(file: string): string | null { try { const stat = fs.statSync(file); if (!stat.isFile() || stat.size < 100) return "SQLite file is missing or too small"; const fd = fs.openSync(file, "r"); const header = Buffer.alloc(100); fs.readSync(fd, header, 0, 100, 0); fs.closeSync(fd); const sqliteHeader = Buffer.from("SQLite format 3", "ascii"); if (!header.subarray(0, sqliteHeader.length).equals(sqliteHeader) || header[sqliteHeader.length] !== 0) return "SQLite header is invalid"; const pageSize = header.readUInt16BE(16) || 65536; if (pageSize < 512 || pageSize > 65536 || (pageSize & (pageSize - 1)) !== 0) return "SQLite page size is invalid"; if (header[20] > pageSize - 1) return "SQLite reserved-byte count is invalid"; if (header[21] !== 64 || header[22] !== 32 || header[23] !== 32) return "SQLite payload fractions are invalid"; const pageCount = header.readUInt32BE(28); if (pageCount > 0 && stat.size < pageCount * pageSize) return "SQLite file is truncated"; return null; } catch { return "SQLite file could not be read"; } }
function isValidSqliteFile(file: string) { return sqliteValidationError(file) === null; }
async function minarvaSqliteValidationError(file: string): Promise<string | null> { return sqliteValidationError(file) || await minarvaBackupSchemaError(file); }
function copySqlite(source: string, destination: string) { fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(source, destination); return fs.statSync(destination).size; }
function createLocalBackup(kind: "manual" | "automatic") { const source = sqlitePath(); if (!fs.existsSync(source) || !isValidSqliteFile(source)) return null; const targetDir = kind === "automatic" ? backupDestinationDir() : backupDir(); fs.mkdirSync(targetDir, { recursive: true }); const destination = path.join(targetDir, `minarvabiz-${kind}-${timestamp()}.db`); const sizeBytes = copySqlite(source, destination); if (!isValidSqliteFile(destination)) { try { fs.unlinkSync(destination); } catch {} return null; } return { path: destination, sizeBytes }; }
function pruneAutomaticBackups(retention = 14) { const targetDir = backupDestinationDir(); fs.mkdirSync(targetDir, { recursive: true }); const files = fs.readdirSync(targetDir).filter((f) => f.startsWith("minarvabiz-automatic-") && f.endsWith(".db")).map((name) => ({ name, time: fs.statSync(path.join(targetDir, name)).mtimeMs })).sort((a, b) => b.time - a.time); for (const item of files.slice(retention)) { try { fs.unlinkSync(path.join(backupDestinationDir(), item.name)); } catch {} } }

app.disableHardwareAcceleration();
app.whenReady().then(() => { Menu.setApplicationMenu(null); runtimeSmokeLog(`app-ready platform=${process.platform} version=${app.getVersion()} userData=${app.getPath("userData")}`); process.env.MINARVA_SQLITE_PATH = sqlitePath(); process.env.MINARVA_MODE = process.env.MINARVA_MODE || "production"; fs.mkdirSync(app.getPath("userData"), { recursive: true }); configureDesktopSession(); registerDesktopLicenseIpc(getDeviceId, requireTrustedRenderer); createWindow(); app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

ipcMain.handle("app:getVersion", (event) => { requireTrustedRenderer(event); return app.getVersion(); });
ipcMain.handle("app:getDeviceId", (event) => { requireTrustedRenderer(event); return getDeviceId(); });
ipcMain.handle("db:readBinary", (event) => { requireTrustedRenderer(event); try { return fs.existsSync(sqlitePath()) ? fs.readFileSync(sqlitePath()) : null; } catch { return null; } });
ipcMain.handle("db:writeBinary", (event, data: unknown) => {
  requireTrustedRenderer(event);
  if (!(data instanceof Uint8Array) || data.byteLength === 0 || data.byteLength > MAX_SQLITE_IPC_BYTES) return false;
  const file = sqlitePath(), temp = `${file}.restore-${process.pid}-${Date.now()}`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(temp, Buffer.from(data));
  if (!isValidSqliteFile(temp)) { fs.unlinkSync(temp); return false; }
  fs.renameSync(temp, file);
  return true;
});
ipcMain.handle("db:exists", (event) => { requireTrustedRenderer(event); return fs.existsSync(sqlitePath()); });
ipcMain.handle("trial:getState", async (event) => { requireTrustedRenderer(event); const license = await getDesktopLicenseState(getDeviceId()); if (license.status === "active" || license.status === "grace") return { activated: true, status: "active", daysRemaining: license.daysRemaining ?? 0, trialStartedAt: null, trialExpiresAt: null, registration: null, synced: true }; return trialSnapshot(); });
ipcMain.handle("trial:activate", (event, registration: unknown) => {
  requireTrustedRenderer(event);
  const input = registration && typeof registration === "object" ? registration as Partial<TrialRegistration> : {};
  const email = String(input.email || "").trim().toLowerCase();
  const phone = String(input.phone || "").trim();
  const organizationName = String(input.organizationName || "").trim();
  const address = String(input.address || "").trim();
  if (
    email.length > MAX_TRIAL_EMAIL_CHARS ||
    phone.length > MAX_TRIAL_PHONE_CHARS ||
    organizationName.length > MAX_TRIAL_ORG_CHARS ||
    address.length > MAX_TRIAL_ADDRESS_CHARS
  ) return { ok: false, error: "Trial registration fields are too long." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[0-9+() .-]{6,50}$/.test(phone) || !organizationName || !address) {
    return { ok: false, error: "Email, phone number, organization name, and address are required." };
  }
  if (readTrial()) return { ok: false, error: "This installation has already activated its trial." };
  const started = new Date(), expires = new Date(started.getTime() + 30 * 86400000);
  const value: StoredTrial = { email, phone, organizationName, address, activationId: randomUUID(), deviceId: getTrialDeviceId(), activatedAt: started.toISOString(), trialExpiresAt: expires.toISOString(), lastSeenAt: started.toISOString(), synced: false };
  try { writeTrial(value); return { ok: true, state: trialSnapshot() }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
});
ipcMain.handle("trial:markSynced", (event) => { requireTrustedRenderer(event); const trial = readTrial(); if (!trial) return false; try { writeTrial({ ...trial, synced: true }); return true; } catch { return false; } });
ipcMain.handle("backup:list", async (event) => { requireTrustedRenderer(event); fs.mkdirSync(backupDir(), { recursive: true }); const filenames = fs.readdirSync(backupDir()).filter((f) => f.endsWith(".db")); const items = await Promise.all(filenames.map(async (filename) => { const full = path.join(backupDir(), filename), stat = fs.statSync(full), validationError = await minarvaSqliteValidationError(full), kind = filename.includes("-automatic-") ? "automatic" : "manual"; return { id: filename, filename, createdAt: stat.mtime.toISOString(), sizeBytes: stat.size, kind, verified: validationError === null, location: "local" }; })); return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); });
ipcMain.handle("backup:createManual", async (event) => { requireTrustedRenderer(event); const source = sqlitePath(); if (!fs.existsSync(source)) return { ok: false, error: "SQLite database is missing or invalid" }; const sourceError = await minarvaSqliteValidationError(source); if (sourceError) return { ok: false, error: `Minarva Biz database failed backup validation: ${sourceError}` }; const result = await dialog.showSaveDialog({ title: "Save Minarva Biz Backup", defaultPath: path.join(app.getPath("documents"), `minarvabiz-backup-${timestamp()}.db`), filters: [{ name: "Minarva Biz SQLite Backup", extensions: ["db"] }] }); if (result.canceled || !result.filePath) return { ok: false, cancelled: true }; try { const sizeBytes = copySqlite(source, result.filePath); const validationError = await minarvaSqliteValidationError(result.filePath); if (validationError) { try { fs.unlinkSync(result.filePath); } catch {} return { ok: false, error: `Created backup failed Minarva Biz validation: ${validationError}` }; } return { ok: true, path: result.filePath, sizeBytes, filename: path.basename(result.filePath) }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; } });
ipcMain.handle("backup:export", async (event, id: unknown) => {
  requireTrustedRenderer(event);
  const cleanId = typeof id === "string" ? id : "";
  if (!cleanId || cleanId.length > MAX_BACKUP_ID_CHARS || cleanId !== path.basename(cleanId) || !/^[A-Za-z0-9._-]+\.db$/i.test(cleanId)) {
    return { ok: false, error: "Backup identifier is invalid" };
  }
  const source = path.join(backupDir(), cleanId);
  if (!fs.existsSync(source)) return { ok: false, error: "Backup file is missing or invalid" };
  const sourceError = await minarvaSqliteValidationError(source);
  if (sourceError) return { ok: false, error: `Backup file failed Minarva Biz validation: ${sourceError}` };
  const result = await dialog.showSaveDialog({ title: "Export Minarva Biz Backup", defaultPath: path.join(app.getPath("documents"), cleanId), filters: [{ name: "Minarva Biz SQLite Backup", extensions: ["db"] }] });
  if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
  try {
    const sizeBytes = copySqlite(source, result.filePath);
    const validationError = await minarvaSqliteValidationError(result.filePath);
    if (validationError) { try { fs.unlinkSync(result.filePath); } catch {} return { ok: false, error: `Exported backup failed Minarva Biz validation: ${validationError}` }; }
    return { ok: true, path: result.filePath, sizeBytes, filename: path.basename(result.filePath) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});
ipcMain.handle("backup:chooseDestination", async (event) => { requireTrustedRenderer(event); const result = await dialog.showOpenDialog({ title: "Choose automatic backup folder", properties: ["openDirectory", "createDirectory"] }); if (result.canceled || !result.filePaths[0]) return null; const selected = path.resolve(result.filePaths[0]); fs.mkdirSync(selected, { recursive: true }); fs.writeFileSync(backupDestinationConfigPath(), selected, "utf8"); return selected; });
ipcMain.handle("backup:createAutomatic", async (event) => { requireTrustedRenderer(event); try { const result = createLocalBackup("automatic"); if (!result) return { ok: false, error: "SQLite database does not exist or is invalid" }; const validationError = await minarvaSqliteValidationError(result.path); if (validationError) { try { fs.unlinkSync(result.path); } catch {} return { ok: false, error: `Automatic backup failed Minarva Biz validation: ${validationError}` }; } return { ok: true, ...result, filename: path.basename(result.path) }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; } });
ipcMain.handle("backup:pruneAutomatic", (event, retention?: number) => { requireTrustedRenderer(event); const safeRetention = Number.isFinite(retention) ? Math.max(1, Math.min(365, Math.floor(retention as number))) : 14; pruneAutomaticBackups(safeRetention); return true; });
ipcMain.handle("backup:restoreFromFile", async (event) => { requireTrustedRenderer(event); const result = await dialog.showOpenDialog({ title: "Restore Minarva Biz Backup", properties: ["openFile"], filters: [{ name: "Minarva Biz SQLite Backup", extensions: ["db"] }] }); if (result.canceled || !result.filePaths[0]) return { ok: false, cancelled: true }; const source = result.filePaths[0]; const validationError = await minarvaSqliteValidationError(source); if (validationError) return { ok: false, error: `Selected file is not a valid Minarva Biz SQLite backup: ${validationError}` }; const target = sqlitePath(), temp = `${target}.restore-${process.pid}-${Date.now()}`, rollback = `${target}.rollback-${process.pid}-${Date.now()}`; let targetMoved = false; try { const pre = createLocalBackup("automatic"); copySqlite(source, temp); const stagedError = await minarvaSqliteValidationError(temp); if (stagedError) { fs.unlinkSync(temp); return { ok: false, error: `Restore staging file failed SQLite validation: ${stagedError}` }; } if (fs.existsSync(target)) { fs.renameSync(target, rollback); targetMoved = true; } fs.renameSync(temp, target); const restoredError = await minarvaSqliteValidationError(target); if (restoredError) throw new Error(`Restored database failed SQLite validation: ${restoredError}`); if (targetMoved) { try { fs.unlinkSync(rollback); } catch {} } return { ok: true, source, preRestoreBackup: pre?.path ?? null }; } catch (e) { try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch {} try { if (fs.existsSync(target) && targetMoved) fs.unlinkSync(target); } catch {} try { if (targetMoved && fs.existsSync(rollback)) { fs.renameSync(rollback, target); } } catch {} return { ok: false, error: `Restore failed and the previous database was restored when possible: ${e instanceof Error ? e.message : String(e)}` }; } });
ipcMain.handle("printer:list", async (event) => {
  requireTrustedRenderer(event);
  const printers = await event.sender.getPrintersAsync();
  return printers.map((printer) => ({
    name: printer.name,
    displayName: printer.displayName || printer.name,
    description: printer.description || "",
    status: printer.status,
    isDefault: Boolean(printer.isDefault),
  }));
});
ipcMain.handle("printer:printHtml", async (event, input: { html: string; deviceName?: string | null; paper?: "a4" | "thermal"; thermalWidthMm?: number }) => {
  requireTrustedRenderer(event);
  return printHtmlDocument(input);
});
ipcMain.handle("update:check", async (event) => {
  requireTrustedRenderer(event);
  return checkForSecureUpdate(app.getVersion());
});
ipcMain.handle("update:download", async (event) => {
  requireTrustedRenderer(event);
  return downloadVerifiedUpdate(app.getPath("userData"));
});
ipcMain.handle("update:install", async (event) => {
  requireTrustedRenderer(event);
  if (process.platform !== "win32") return { ok: false, error: "Installer updates are supported on Windows only." };
  const update = getDownloadedVerifiedUpdate();
  if (!update) return { ok: false, error: "No verified downloaded update is available." };

  // Upgrade safety gate: never start an updater unless a fresh valid SQLite backup exists.
  const backup = createLocalBackup("automatic");
  if (!backup || await minarvaSqliteValidationError(backup.path)) {
    return { ok: false, error: "Update blocked: a verified Minarva Biz pre-update database backup could not be created." };
  }

  try {
    const child = spawn(update.path, [], { detached: true, stdio: "ignore", windowsHide: false });
    child.unref();
    setTimeout(() => app.quit(), 350);
    return { ok: true, version: update.version, backupPath: backup.path };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});
ipcMain.handle("app:relaunch", (event) => { requireTrustedRenderer(event); app.relaunch(); app.exit(0); return true; });
