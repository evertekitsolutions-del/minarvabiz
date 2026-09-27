import fs from "node:fs";

const port = Number(process.env.MINARVA_CDP_PORT || 9224);
const base = `http://127.0.0.1:${port}`;
const mode = process.argv[2] || "prepare";
const expectedFrom = process.env.MINARVA_UPDATE_FROM || "1.0.8";
const expectedTo = process.env.MINARVA_UPDATE_TO || "1.0.9";
const marker = process.env.MINARVA_UPDATE_E2E_CUSTOMER || "Upgrade E2E Customer";
const stateFile = process.env.MINARVA_UPDATE_E2E_STATE_FILE || "update-e2e-state.json";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let nextId = 0;
const pending = new Map();

async function httpJson(path) {
  const response = await fetch(`${base}${path}`);
  if (!response.ok) throw new Error(`CDP HTTP ${response.status} for ${path}`);
  return response.json();
}

async function connect() {
  let target;
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const pages = await httpJson("/json/list");
      target = pages.find((page) => page.type === "page" && page.webSocketDebuggerUrl);
      if (target) break;
    } catch {}
    await sleep(500);
  }
  if (!target) throw new Error("Electron renderer CDP target was not found.");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  ws.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(event.data);
      const item = pending.get(message.id);
      if (!item) return;
      clearTimeout(item.timer);
      pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error.message || "CDP error"));
      else if (message.result?.exceptionDetails) {
        item.reject(new Error(message.result.exceptionDetails.exception?.description || message.result.exceptionDetails.text || "Renderer evaluation failed"));
      } else item.resolve(message.result?.result?.value);
    } catch {}
  });
  return ws;
}

async function evalIn(ws, expression, timeout = 180000) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${expression.slice(0, 140)}`));
    }, timeout);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({
      id,
      method: "Runtime.evaluate",
      params: { expression, awaitPromise: true, returnByValue: true },
    }));
  });
}

async function ready(ws) {
  for (let attempt = 1; attempt <= 80; attempt += 1) {
    const raw = await evalIn(ws, `JSON.stringify({ready:document.documentElement.dataset.minarvaRendererReady==='true',error:document.documentElement.dataset.minarvaRendererError==='true',text:(document.body?.innerText||'').slice(0,1600)})`);
    const state = JSON.parse(raw);
    if (state.error) throw new Error(`Renderer startup error: ${state.text}`);
    if (state.ready) return;
    await sleep(500);
  }
  throw new Error("Renderer did not become ready.");
}

async function click(ws, name, patterns, wait = 700) {
  const raw = await evalIn(ws, `(async()=>{
    const pats=${JSON.stringify(patterns)};
    const visible=(el)=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!el.disabled};
    const label=(el)=>((el.innerText||el.textContent||'')+' '+(el.getAttribute('aria-label')||'')).replace(/\\s+/g,' ').trim();
    const match=(el)=>visible(el)&&pats.some((p)=>label(el).toLowerCase().includes(String(p).toLowerCase()));
    const sidebar=()=>[...document.querySelectorAll('aside button,aside a,aside [role="button"]')].find(match);
    let el=sidebar();
    if(!el){
      const groups=[...document.querySelectorAll('aside button[aria-expanded]')].filter(visible);
      for(const group of groups){
        if(group.getAttribute('aria-expanded')!=='true'){group.click();await new Promise((r)=>setTimeout(r,100));}
        el=sidebar();
        if(el)break;
      }
    }
    if(!el)el=[...document.querySelectorAll('button,a,[role="button"],tr')].find(match);
    if(!el)return JSON.stringify({ok:false,available:[...document.querySelectorAll('button,a,[role="button"],tr')].filter(visible).map(label).filter(Boolean).slice(0,180)});
    el.click();
    await new Promise((r)=>setTimeout(r,${wait}));
    return JSON.stringify({ok:true,text:label(el)});
  })()`);
  const result = JSON.parse(raw);
  console.log(`CLICK_${name} ${raw}`);
  if (!result.ok) throw new Error(`Could not find ${name}. Available=${JSON.stringify(result.available || [])}`);
}

async function setDialogField(ws, dialogName, labelText, value) {
  const raw = await evalIn(ws, `(()=>{
    const dialog=[...document.querySelectorAll('[role="dialog"]')].find((d)=>((d.getAttribute('aria-label')||'')+' '+(d.innerText||'')).toLowerCase().includes(${JSON.stringify(dialogName.toLowerCase())}));
    const labels=[...(dialog?.querySelectorAll('label')||[])];
    const label=labels.find((l)=>(l.innerText||'').toLowerCase().includes(${JSON.stringify(labelText.toLowerCase())}));
    const el=label?.querySelector('input,textarea,select');
    if(!el)return JSON.stringify({ok:false,labels:labels.map((l)=>l.innerText)});
    if(el.tagName==='SELECT'){
      const option=[...el.options].find((o)=>(o.textContent||'').toLowerCase().includes(${JSON.stringify(String(value).toLowerCase())}));
      if(!option)return JSON.stringify({ok:false,options:[...el.options].map((o)=>o.textContent)});
      el.value=option.value;
    }else{
      const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
      setter?setter.call(el,${JSON.stringify(value)}):el.value=${JSON.stringify(value)};
    }
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    return JSON.stringify({ok:true,value:el.value});
  })()`);
  const result = JSON.parse(raw);
  if (!result.ok) throw new Error(`Could not set ${dialogName}/${labelText}: ${raw}`);
}

async function bodyIncludes(ws, value) {
  return Boolean(await evalIn(ws, `(document.querySelector('[data-testid="app-content"]')?.innerText||'').includes(${JSON.stringify(value)})`));
}

async function ensureTrial(ws) {
  const state = JSON.parse(await evalIn(ws, `(async()=>JSON.stringify(await window.minarvaDesktop.getTrialState()))()`));
  if (state.status === "active") return;
  if (state.status !== "unactivated") throw new Error(`Unexpected trial state: ${state.status}`);
  const activation = JSON.parse(await evalIn(ws, `(async()=>JSON.stringify(await window.minarvaDesktop.activateTrial({email:'upgrade-e2e@example.test',phone:'9999900990',organizationName:'Minarva Biz Upgrade E2E',address:'Windows Release Upgrade E2E'})))()`));
  if (!activation.ok || activation.state?.status !== "active") throw new Error(`Trial activation failed: ${activation.error || "unknown"}`);
  await evalIn(ws, `(async()=>{location.reload();return true})()`);
  await sleep(1200);
  await ready(ws);
}

async function prepare(ws) {
  const version = await evalIn(ws, `window.minarvaDesktop.getVersion()`);
  if (version !== expectedFrom) throw new Error(`Expected source version ${expectedFrom}, got ${version}`);
  console.log(`SOURCE_VERSION PASS ${version}`);

  await ensureTrial(ws);
  await click(ws, "CUSTOMERS", ["customers"]);
  if (!(await bodyIncludes(ws, marker))) {
    await click(ws, "ADD_CUSTOMER", ["add customer"]);
    await setDialogField(ws, "Add Customer", "Name", marker);
    await setDialogField(ws, "Add Customer", "Phone", "9999900991");
    await click(ws, "SAVE_CUSTOMER", ["save customer"]);
  }
  if (!(await bodyIncludes(ws, marker))) throw new Error("Upgrade marker customer was not created.");
  console.log("PRE_UPDATE_CUSTOMER PASS");

  const persisted = await evalIn(ws, `(async()=>Boolean(await window.__minarvaDesktopPersist?.()))()`);
  if (!persisted) throw new Error("Business snapshot was not persisted to SQLite.");
  console.log("PRE_UPDATE_SQLITE_PERSIST PASS");

  const check = JSON.parse(await evalIn(ws, `(async()=>JSON.stringify(await window.minarvaDesktop.checkForUpdates()))()`));
  console.log(`UPDATE_CHECK ${JSON.stringify(check)}`);
  if (check.status !== "available" || check.currentVersion !== expectedFrom || check.version !== expectedTo) {
    throw new Error(`Update discovery mismatch: ${JSON.stringify(check)}`);
  }

  const download = JSON.parse(await evalIn(ws, `(async()=>JSON.stringify(await window.minarvaDesktop.downloadUpdate()))()`, 240000));
  console.log(`UPDATE_DOWNLOAD ${JSON.stringify(download)}`);
  if (!download.ok || download.version !== expectedTo || !download.installerPath) {
    throw new Error(`Verified update download failed: ${JSON.stringify(download)}`);
  }

  const install = JSON.parse(await evalIn(ws, `(async()=>JSON.stringify(await window.minarvaDesktop.installUpdate()))()`, 60000));
  console.log(`UPDATE_INSTALL_ENTRYPOINT ${JSON.stringify(install)}`);
  if (!install.ok || install.version !== expectedTo || !install.backupPath) {
    throw new Error(`Update install entrypoint failed: ${JSON.stringify(install)}`);
  }

  fs.writeFileSync(stateFile, JSON.stringify({
    sourceVersion: version,
    targetVersion: expectedTo,
    installerPath: download.installerPath,
    backupPath: install.backupPath,
    marker,
  }, null, 2));
  console.log(`UPDATE_STATE_WRITTEN ${stateFile}`);
}

async function verify(ws) {
  const version = await evalIn(ws, `window.minarvaDesktop.getVersion()`);
  if (version !== expectedTo) throw new Error(`Expected upgraded version ${expectedTo}, got ${version}`);
  console.log(`TARGET_VERSION PASS ${version}`);

  const trial = JSON.parse(await evalIn(ws, `(async()=>JSON.stringify(await window.minarvaDesktop.getTrialState()))()`));
  if (trial.status !== "active") throw new Error(`Trial/license state was not preserved: ${trial.status}`);
  console.log("TRIAL_PRESERVED PASS");

  await click(ws, "CUSTOMERS", ["customers"]);
  if (!(await bodyIncludes(ws, marker))) throw new Error("Customer data was not preserved through the upgrade.");
  console.log("BUSINESS_DATA_PRESERVED PASS");

  const upgradeState = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  const expectedBackupName = String(upgradeState.backupPath || "").split(/[\\/]/).pop();
  const backups = JSON.parse(await evalIn(ws, `(async()=>JSON.stringify(await window.minarvaDesktop.listBackups()))()`));
  const safetyBackup = backups.find((b) => b.verified === true && (!expectedBackupName || b.filename === expectedBackupName));
  if (!safetyBackup) throw new Error(`Verified update safety backup was not retained: expected=${expectedBackupName} backups=${JSON.stringify(backups)}`);
  console.log(`UPDATE_SAFETY_BACKUP PASS kind=${safetyBackup.kind} file=${safetyBackup.filename}`);

  const check = JSON.parse(await evalIn(ws, `(async()=>JSON.stringify(await window.minarvaDesktop.checkForUpdates()))()`));
  console.log(`POST_UPDATE_CHECK ${JSON.stringify(check)}`);
  if (check.status !== "up_to_date" || check.currentVersion !== expectedTo || check.version !== expectedTo) {
    throw new Error(`Post-update status mismatch: ${JSON.stringify(check)}`);
  }
  console.log("POST_UPDATE_CHANNEL PASS");
}

const ws = await connect();
try {
  await ready(ws);
  if (mode === "prepare") await prepare(ws);
  else if (mode === "verify") await verify(ws);
  else throw new Error(`Unknown mode ${mode}`);
  console.log(`WINDOWS_RELEASE_UPDATE_E2E ${mode.toUpperCase()} PASS`);
} finally {
  try { ws.close(); } catch {}
}
