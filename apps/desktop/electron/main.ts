/**
 * Electron main process — Offline / Hybrid Windows shell.
 * Security: contextIsolation, no nodeIntegration, sandboxed preload.
 */

import { app, BrowserWindow, ipcMain, shell } from "electron";
import * as path from "path";
import * as fs from "fs";

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

function dataFilePath() {
  return path.join(app.getPath("userData"), "minarvabiz-db.json");
}
function sqlitePath() {
  return path.join(app.getPath("userData"), "minarvabiz.db");
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

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL || "http://localhost:5173");
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  // Primary transactional DB path for renderer/bootstrap
  process.env.MINARVA_SQLITE_PATH = sqlitePath();
  process.env.MINARVA_MODE = process.env.MINARVA_MODE || "production";
  // Ensure directory exists; DB file created on first openSqliteDatabase
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("app:getVersion", () => app.getVersion());
ipcMain.handle("app:getPath", (_e, name: string) => {
  const allowed = ["userData", "documents", "desktop", "temp"] as const;
  if ((allowed as readonly string[]).includes(name)) {
    return app.getPath(name as (typeof allowed)[number]);
  }
  return null;
});

ipcMain.handle("db:read", () => {
  const file = dataFilePath();
  try {
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  } catch {
    /* ignore */
  }
  return null;
});

ipcMain.handle("db:write", (_e, content: string) => {
  const file = dataFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
  return true;
});

ipcMain.handle("db:sqlitePath", () => sqlitePath());

ipcMain.handle("db:backupSqlite", (_e, destPath: string) => {
  const src = sqlitePath();
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(src, destPath);
  return true;
});

ipcMain.handle("db:getSqlitePath", () => sqlitePath());

ipcMain.handle("db:readBinary", () => {
  const file = sqlitePath();
  try {
    if (fs.existsSync(file)) {
      return fs.readFileSync(file); // Buffer → Uint8Array over IPC
    }
  } catch {
    /* */
  }
  return null;
});

ipcMain.handle("db:writeBinary", (_e, data: Uint8Array | Buffer | number[]) => {
  const file = sqlitePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const buf = Buffer.from(data);
  fs.writeFileSync(file, buf);
  return true;
});

ipcMain.handle("db:exists", () => fs.existsSync(sqlitePath()));
