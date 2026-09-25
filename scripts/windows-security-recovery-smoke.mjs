const cdpBase = process.env.MINARVA_DESKTOP_CDP || "http://127.0.0.1:9222";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function jsonFetch(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}

let nextId = 0;
const pending = new Map();

async function connect() {
  let target;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const pages = await jsonFetch(`${cdpBase}/json/list`);
      target = pages.find((page) => page.type === "page" && page.webSocketDebuggerUrl && String(page.url || "").startsWith("file:"));
      if (target) break;
    } catch {}
    await sleep(500);
  }
  if (!target) throw new Error("Installed Electron CDP target not found");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  ws.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(message.error.message || "CDP error"));
    else if (message.result?.exceptionDetails) {
      waiter.reject(new Error(message.result.exceptionDetails.exception?.description || message.result.exceptionDetails.text || "Renderer evaluation failed"));
    } else waiter.resolve(message.result?.result?.value);
  });
  return ws;
}

async function evalIn(ws, expression, timeout = 30000) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${expression.slice(0, 120)}`));
    }, timeout);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({
      id,
      method: "Runtime.evaluate",
      params: { expression, awaitPromise: true, returnByValue: true },
    }));
  });
}

async function sha256Expression(apiCall) {
  return `(async()=>{const bytes=await ${apiCall};if(!bytes)return null;const digest=await crypto.subtle.digest("SHA-256",bytes);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("")})()`;
}

async function run() {
  const ws = await connect();
  try {
    const isolation = JSON.parse(await evalIn(ws, `JSON.stringify({
      href: location.href,
      requireType: typeof window.require,
      processType: typeof window.process,
      moduleType: typeof window.module,
      bridge: typeof window.minarvaDesktop,
      bridgeKeys: Object.keys(window.minarvaDesktop || {}).sort()
    })`));
    if (!String(isolation.href).startsWith("file:")) throw new Error(`Renderer is not on trusted packaged file origin: ${isolation.href}`);
    for (const key of ["requireType", "processType", "moduleType"]) {
      if (isolation[key] !== "undefined") throw new Error(`Node primitive exposed to renderer: ${key}=${isolation[key]}`);
    }
    if (isolation.bridge !== "object") throw new Error("Typed preload bridge is missing");
    for (const forbidden of ["invoke", "send", "sendSync", "ipcRenderer", "shell", "fs", "exec"]) {
      if (isolation.bridgeKeys.includes(forbidden)) throw new Error(`Dangerous raw preload capability exposed: ${forbidden}`);
    }
    console.log("ELECTRON_SECURITY renderer isolation + narrow preload PASS");

    const oversized = JSON.parse(await evalIn(ws, `(async()=>JSON.stringify(await window.minarvaDesktop.activateLicenseToken("x".repeat(65537))))()`));
    if (oversized.status !== "invalid" || !/too large/i.test(String(oversized.reason || ""))) {
      throw new Error(`Oversized license token was not rejected in preload: ${JSON.stringify(oversized)}`);
    }
    console.log("ELECTRON_SECURITY oversized IPC payload PASS");

    const beforeHash = await evalIn(ws, await sha256Expression("window.minarvaDesktop.readSqliteBinary()"));
    if (!beforeHash) throw new Error("SQLite database is missing before recovery-path test");
    const rejectedWrite = await evalIn(ws, `window.minarvaDesktop.writeSqliteBinary(new Uint8Array([1,2,3,4]))`);
    if (rejectedWrite !== false) throw new Error("Invalid SQLite restore bytes were accepted");
    const afterHash = await evalIn(ws, await sha256Expression("window.minarvaDesktop.readSqliteBinary()"));
    if (afterHash !== beforeHash) throw new Error("Rejected SQLite restore mutated the existing database");
    console.log("ELECTRON_RECOVERY invalid SQLite write rollback PASS");

    const backup = JSON.parse(await evalIn(ws, `(async()=>JSON.stringify(await window.minarvaDesktop.createAutomaticBackup()))()`));
    if (!backup.ok || !backup.path || !(Number(backup.sizeBytes) > 100)) {
      throw new Error(`Automatic recovery backup failed: ${JSON.stringify(backup)}`);
    }
    // createAutomaticBackup() validates the copied file in the main process before
    // returning ok=true. On Windows runners the configured destination can be D:\\,
    // while listBackups() intentionally enumerates only the local userData backup folder.
    console.log("ELECTRON_RECOVERY verified automatic backup PASS");

    const updateInstall = JSON.parse(await evalIn(ws, `(async()=>JSON.stringify(await window.minarvaDesktop.installUpdate()))()`));
    if (updateInstall.ok !== false || !/No verified downloaded update/i.test(String(updateInstall.error || ""))) {
      throw new Error(`Updater install gate did not fail closed: ${JSON.stringify(updateInstall)}`);
    }
    console.log("ELECTRON_SECURITY unverified update install blocked PASS");

    const permission = await evalIn(ws, `Notification.requestPermission()`);
    if (permission !== "denied") throw new Error(`Notification permission was not denied: ${permission}`);
    console.log("ELECTRON_SECURITY permission denial PASS");

    const pageCountBefore = (await jsonFetch(`${cdpBase}/json/list`)).filter((page) => page.type === "page").length;
    const opened = await evalIn(ws, `window.open("https://example.com/minarva-security-negative","_blank")===null`);
    await sleep(700);
    const pageCountAfter = (await jsonFetch(`${cdpBase}/json/list`)).filter((page) => page.type === "page").length;
    if (!opened || pageCountAfter !== pageCountBefore) throw new Error("External window-open was not denied");
    console.log("ELECTRON_SECURITY external window-open denied PASS");

    const trustedUrl = String(await evalIn(ws, "location.href"));
    await evalIn(ws, `location.href="https://example.com/minarva-navigation-negative"`);
    await sleep(900);
    const afterNavigation = String(await evalIn(ws, "location.href"));
    if (afterNavigation !== trustedUrl || !afterNavigation.startsWith("file:")) {
      throw new Error(`External navigation escaped trusted renderer: ${afterNavigation}`);
    }
    console.log("ELECTRON_SECURITY external navigation denied PASS");

    console.log("Electron E2E security-negative and recovery-path suite PASS");
  } finally {
    ws.close();
  }
}

run().catch((error) => {
  console.error("ELECTRON_SECURITY_RECOVERY_E2E FAIL");
  console.error(error?.stack || error);
  process.exit(1);
});
