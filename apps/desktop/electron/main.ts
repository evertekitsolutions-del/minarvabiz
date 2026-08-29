/**
 * Electron main process — Offline / Hybrid Windows shell.
 * Security: contextIsolation, no nodeIntegration, sandboxed preload.
 */

import { app, BrowserWindow, ipcMain, shell } from "electron";
import * as path from "path";

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

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

  // Open external links in OS browser
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
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Minimal secure IPC surface
ipcMain.handle("app:getVersion", () => app.getVersion());
ipcMain.handle("app:getPath", (_e, name: string) => {
  const allowed = ["userData", "documents", "desktop", "temp"] as const;
  if ((allowed as readonly string[]).includes(name)) {
    return app.getPath(name as (typeof allowed)[number]);
  }
  return null;
});
