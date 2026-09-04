/**
 * Electron main process — Offline / Hybrid Windows shell.
 * Security: contextIsolation, no nodeIntegration, sandboxed preload.
 */

import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import * as path from "path";
import * as fs from "fs";
import { randomUUID } from "crypto";

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

function dataFilePath() {
  return path.join(app.getPath("userData"), "minarvabiz-db.json");
}
function deviceIdPath() {
  return path.join(app.getPath("userData"), "device-id");
}
function sqlitePath() {
  return path.join(app.getPath("userData"), "minarvabiz.db");
}
function backupDir() {
  return path.join(app.getPath("userData"), "backups");
}
function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function getDeviceId() {
  const file = deviceIdPath();
  try {
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
    const id = randomUUID();
    fs.writeFileSync(file, id, "utf8");
    return id;
  } catch {
    return `desktop-${process.platform}-${app.getVersion()}`;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: "Minarva Biz",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  win.once("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL || "http://localhost:5173");
  } else {
    win.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  }
}

function isValidSqliteFile(file: string) {
  try {
    const fd = fs.openSync(file, "r");
    const header = Buffer.alloc(16);
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);
    return header.toString("utf8") === "SQLite format 3\u0000";
  } catch {
    return false;
  }
}

function copySqlite(source: string, destination: string) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  return fs.statSync(destination).size;
}

function createLocalBackup(kind: "manual" | "automatic") {
  const source = sqlitePath();
  if (!fs.existsSync(source)) return null;
  fs.mkdirSync(backupDir(), { recursive: true });
  const destination = path.join(backupDir(), `minarvabiz-${kind}-${timestamp()}.db`);
  const sizeBytes = copySqlite(source, destination);
  return { path: destination, sizeBytes };
}

function pruneAutomaticBackups(retention = 14) {
  fs.mkdirSync(backupDir(), { recursive: true });
  const files = fs.readdirSync(backupDir())
    .filter((f) => f.startsWith("minarvabiz-automatic-") && f.endsWith(".db"))
    .map((name) => ({ name, time: fs.statSync(path.join(backupDir(), name)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  for (const item of files.slice(retention)) {
    try { fs.unlinkSync(path.join(backupDir(), item.name)); } catch { /* ignore */ }
  }
}

app.whenReady().then(() => {
  process.env.MINARVA_SQLITE_PATH = sqlitePath();
  process.env.MINARVA_MODE = process.env.MINARVA_MODE || "production";
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  createWindow();
  // Create a persistent automatic backup after the first normal DB bootstrap.
  setTimeout(() => {
    try {
      const dir = backupDir();
      fs.mkdirSync(dir, { recursive: true });
      const latest = fs.readdirSync(dir)
        .filter((f) => f.startsWith("minarvabiz-automatic-") && f.endsWith(".db"))
        .map((f) => fs.statSync(path.join(dir, f)).mtimeMs)
        .sort((a, b) => b - a)[0];
      if (!latest || Date.now() - latest >= 24 * 3600 * 1000) {
        createLocalBackup("automatic");
        pruneAutomaticBackups();
      }
    } catch { /* backup must never prevent app startup */ }
  }, 3000);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("app:getVersion", () => app.getVersion());
ipcMain.handle("app:getPath", (_e: unknown, name: string) => {
  const allowed = ["userData", "documents", "desktop", "temp"] as const;
  if ((allowed as readonly string[]).includes(name)) return app.getPath(name as (typeof allowed)[number]);
  return null;
});

ipcMain.handle("db:read", () => {
  const file = dataFilePath();
  try { if (fs.existsSync(file)) return fs.readFileSync(file, "utf8"); } catch { /* ignore */ }
  return null;
});
ipcMain.handle("db:write", (_e: unknown, content: string) => {
  const file = dataFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
  return true;
});
ipcMain.handle("db:sqlitePath", () => sqlitePath());
ipcMain.handle("db:backupSqlite", (_e: unknown, destPath: string) => {
  const src = sqlitePath();
  if (!fs.existsSync(src)) return false;
  copySqlite(src, destPath);
  return true;
});
ipcMain.handle("db:getSqlitePath", () => sqlitePath());
ipcMain.handle("app:getDeviceId", () => getDeviceId());
ipcMain.handle("db:readBinary", () => {
  try { if (fs.existsSync(sqlitePath())) return fs.readFileSync(sqlitePath()); } catch { /* */ }
  return null;
});
ipcMain.handle("db:writeBinary", (_e: unknown, data: Uint8Array | Buffer | number[]) => {
  const file = sqlitePath();
  const temp = `${file}.restore-${process.pid}-${Date.now()}`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(temp, Buffer.from(data));
  if (!isValidSqliteFile(temp)) { fs.unlinkSync(temp); return false; }
  fs.renameSync(temp, file);
  return true;
});
ipcMain.handle("db:exists", () => fs.existsSync(sqlitePath()));

ipcMain.handle("backup:list", () => {
  fs.mkdirSync(backupDir(), { recursive: true });
  return fs.readdirSync(backupDir())
    .filter((f) => f.endsWith(".db"))
    .map((filename) => {
      const full = path.join(backupDir(), filename);
      const stat = fs.statSync(full);
      const kind = filename.includes("-automatic-") ? "automatic" : filename.includes("-pre-restore-") ? "automatic" : "manual";
      return { id: filename, filename, createdAt: stat.mtime.toISOString(), sizeBytes: stat.size, kind, verified: isValidSqliteFile(full), location: "local" };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
});

ipcMain.handle("backup:createManual", async () => {
  const source = sqlitePath();
  if (!fs.existsSync(source)) return { ok: false, error: "SQLite database does not exist yet" };
  const result = await dialog.showSaveDialog({
    title: "Save Minarva Biz Backup",
    defaultPath: path.join(app.getPath("documents"), `minarvabiz-backup-${timestamp()}.db`),
    filters: [{ name: "Minarva Biz SQLite Backup", extensions: ["db"] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
  try {
    const sizeBytes = copySqlite(source, result.filePath);
    return { ok: true, path: result.filePath, sizeBytes, filename: path.basename(result.filePath) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

ipcMain.handle("backup:createAutomatic", () => {
  try {
    const result = createLocalBackup("automatic");
    if (!result) return { ok: false, error: "SQLite database does not exist yet" };
    pruneAutomaticBackups();
    return { ok: true, ...result, filename: path.basename(result.path) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

ipcMain.handle("backup:restoreFromFile", async () => {
  const result = await dialog.showOpenDialog({
    title: "Restore Minarva Biz Backup",
    properties: ["openFile"],
    filters: [{ name: "Minarva Biz SQLite Backup", extensions: ["db"] }],
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, cancelled: true };
  const source = result.filePaths[0];
  if (!isValidSqliteFile(source)) return { ok: false, error: "Selected file is not a valid SQLite database backup" };
  try {
    const pre = createLocalBackup("automatic");
    const target = sqlitePath();
    const temp = `${target}.restore-${process.pid}-${Date.now()}`;
    copySqlite(source, temp);
    fs.renameSync(temp, target);
    return { ok: true, source, preRestoreBackup: pre?.path ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

ipcMain.handle("app:relaunch", () => {
  app.relaunch();
  app.exit(0);
  return true;
});
