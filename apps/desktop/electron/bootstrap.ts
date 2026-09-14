import { app, BrowserWindow } from "electron";

/**
 * Bootstrap runs before the existing Electron main module. It hardens the
 * native Windows chrome and adds a renderer startup watchdog without
 * changing the existing application IPC/business logic in main.ts.
 */
app.on("browser-window-created", (_event, win) => {
  win.removeMenu();
  win.setMenuBarVisibility(false);
  win.setAutoHideMenuBar(true);
  win.setTitle(`Minarva Biz ${app.getVersion()}`);

  const reportRendererState = async () => {
    try {
      const state = await win.webContents.executeJavaScript(
        `(() => ({
          href: location.href,
          readyState: document.readyState,
          rootChildren: document.getElementById("root")?.children.length ?? -1,
          bodyText: document.body?.innerText?.slice(0, 300) ?? "",
          bridge: Boolean(window.minarvaDesktop && typeof window.minarvaDesktop.getSqlitePath === "function")
        }))()` ,
        true,
      ) as {
        href?: string;
        readyState?: string;
        rootChildren?: number;
        bodyText?: string;
        bridge?: boolean;
      };

      if ((state.rootChildren ?? 0) < 1) {
        await win.webContents.executeJavaScript(`(() => {
          document.body.innerHTML = '';
          const wrap = document.createElement('div');
          wrap.style.cssText = 'min-height:100vh;display:grid;place-items:center;padding:32px;box-sizing:border-box;background:#f8fafc;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#0f172a';
          const card = document.createElement('div');
          card.style.cssText = 'width:min(760px,100%);padding:32px;border:1px solid #dbe5f5;border-radius:20px;background:white;box-shadow:0 18px 50px rgba(15,23,42,.10)';
          const title = document.createElement('h1');
          title.textContent = 'Minarva Biz ${app.getVersion()}';
          title.style.cssText = 'margin:0;color:#2563eb;font-size:28px';
          const heading = document.createElement('h2');
          heading.textContent = 'Desktop interface did not start';
          heading.style.cssText = 'margin:18px 0 8px;font-size:20px';
          const detail = document.createElement('pre');
          detail.textContent = JSON.stringify({href: location.href, readyState: document.readyState, bridge: Boolean(window.minarvaDesktop)}, null, 2);
          detail.style.cssText = 'margin:0;padding:14px;border-radius:12px;background:#f8fafc;overflow:auto;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace';
          card.append(title, heading, detail);
          wrap.append(card);
          document.body.append(wrap);
        })()` , true);
      }
    } catch {
      // Existing main.ts runtime diagnostics will capture the detailed error.
    }
  };

  win.webContents.on("did-finish-load", () => {
    setTimeout(() => void reportRendererState(), 1200);
  });
});

import "./main";
