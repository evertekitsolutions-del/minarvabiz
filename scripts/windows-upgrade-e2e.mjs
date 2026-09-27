import fs from "node:fs";
import path from "node:path";

const mode = process.argv[2] || "before";
const port = Number(process.env.MINARVA_UPGRADE_CDP_PORT || (mode === "after" ? "9224" : "9222"));
const oldVersion = process.env.MINARVA_OLD_VERSION || "1.0.8";
const newVersion = process.env.MINARVA_NEW_VERSION || "1.0.9";
const resultPath = process.env.MINARVA_UPGRADE_RESULT || path.join(process.cwd(), "upgrade-e2e-result.json");
const customerName = process.env.MINARVA_UPGRADE_CUSTOMER || "Upgrade Persist Customer";
const base = `http://127.0.0.1:${port}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function httpJson(endpoint) {
  const response = await fetch(`${base}${endpoint}`);
  if (!response.ok) throw new Error(`CDP HTTP ${response.status} for ${endpoint}`);
  return response.json();
}

async function connect() {
  let target;
  for (let attempt = 1; attempt <= 45; attempt += 1) {
    try {
      const pages = await httpJson("/json/list");
      target = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
      if (target) break;
    } catch {}
    await sleep(1000);
  }
  if (!target) throw new Error(`Electron renderer CDP target was not found on port ${port}`);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();

  ws.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const item = pending.get(message.id);
      if (!item) return;
      clearTimeout(item.timer);
      pending.delete(message.id);
      if (message.error) {
        item.reject(new Error(message.error.message || "CDP error"));
        return;
      }
      if (message.result?.exceptionDetails) {
        item.reject(new Error(message.result.exceptionDetails.text || "Renderer evaluation failed"));
        return;
      }
      item.resolve(message.result?.result?.value);
    } catch (error) {
      for (const item of pending.values()) {
        clearTimeout(item.timer);
        item.reject(error);
      }
      pending.clear();
    }
  });

  async function evaluate(expression, timeoutMs = 30000) {
    const id = ++nextId;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`CDP evaluate timeout after ${timeoutMs}ms: ${expression.slice(0, 140)}`)),
        timeoutMs,
      );
      pending.set(id, { resolve, reject, timer });
    });
    ws.send(JSON.stringify({
      id,
      method: "Runtime.evaluate",
      params: { expression, returnByValue: true, awaitPromise: true },
    }));
    return promise;
  }

  return { ws, evaluate };
}

async function waitForRendererReady(evaluate) {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const raw = await evaluate(`JSON.stringify({
      ready: document.documentElement.dataset.minarvaRendererReady === "true",
      error: document.documentElement.dataset.minarvaRendererError === "true",
      text: (document.body?.innerText || "").slice(0, 1500)
    })`);
    const state = JSON.parse(raw);
    if (state.error) throw new Error(`Renderer reported fatal startup error: ${state.text}`);
    if (state.ready || /(dashboard|customers|products|sales|reports|starting trial|trial)/i.test(state.text)) return;
    await sleep(500);
  }
  throw new Error("Installed renderer did not become ready within 30 seconds");
}

async function ensureTrial(evaluate) {
  const trial = JSON.parse(await evaluate(`(async()=>JSON.stringify(await window.minarvaDesktop.getTrialState()))()`));
  if (trial.status === "active") return trial;
  if (trial.status !== "unactivated") throw new Error(`Unexpected trial status before upgrade: ${trial.status}`);

  const activated = JSON.parse(await evaluate(`(async()=>{
    return JSON.stringify(await window.minarvaDesktop.activateTrial({
      email: "upgrade-e2e-${Date.now()}@example.com",
      phone: "9999999999",
      organizationName: "Minarva Biz Upgrade E2E",
      address: "Windows CI Upgrade Test"
    }));
  })()`, 60000));

  if (!activated.ok || activated.state?.status !== "active") {
    throw new Error(`Trial activation failed: ${activated.error || activated.state?.status || "unknown"}`);
  }
  await evaluate(`(async()=>{ location.reload(); return "reloading"; })()`);
  await sleep(1200);
  await waitForRendererReady(evaluate);
  return activated.state;
}

async function clickTarget(evaluate, name, patterns) {
  const raw = await evaluate(`(async()=>{
    const pats=${JSON.stringify(patterns)};
    const visible=(el)=>{const r=el.getBoundingClientRect();const s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=="hidden"&&s.display!=="none"&&!el.disabled};
    const label=(el)=>((el.innerText||el.textContent||"")+" "+(el.getAttribute("aria-label")||"")).replace(/\\s+/g," ").trim();
    const score=(el)=>{const s=label(el).toLowerCase();return pats.some(p=>s.includes(String(p).toLowerCase()))};
    const findSidebar=()=>[...document.querySelectorAll("aside button,aside a,aside [role='button']")].find(e=>visible(e)&&score(e));
    const findAny=()=>[...document.querySelectorAll("button,a,[role='button']")].find(e=>visible(e)&&score(e));
    let el=findSidebar();
    if(!el){
      const groups=[...document.querySelectorAll("aside button[aria-expanded]")].filter(visible);
      for(const group of groups){
        if(group.getAttribute("aria-expanded")!=="true"){group.click();await new Promise(r=>setTimeout(r,100));}
        el=findSidebar();
        if(el) break;
      }
    }
    if(!el) el=findAny();
    if(!el) return JSON.stringify({ok:false,available:[...document.querySelectorAll("button,a,[role='button']")].filter(visible).map(label).filter(Boolean).slice(0,140)});
    el.click();
    await new Promise(r=>setTimeout(r,900));
    return JSON.stringify({ok:true,text:label(el),body:(document.body?.innerText||"").slice(0,5000)});
  })()`);
  const result = JSON.parse(raw);
  console.log(`CLICK_${name} ${raw}`);
  if (!result.ok) throw new Error(`Could not find ${name}. Available=${JSON.stringify(result.available || [])}`);
  return result;
}

async function createPersistentCustomer(evaluate) {
  await clickTarget(evaluate, "CUSTOMERS", ["customers"]);
  await clickTarget(evaluate, "ADD_CUSTOMER", ["add customer"]);

  const filled = JSON.parse(await evaluate(`(async()=>{
    const dialogs=[...document.querySelectorAll("[role='dialog']")];
    const root=dialogs.find(d=>/add customer/i.test(((d.getAttribute("aria-label")||"")+" "+(d.innerText||"")))) || dialogs.at(-1) || document;
    const fields=[...root.querySelectorAll("input,textarea")].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0});
    const set=(el,val)=>{
      const proto=el.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      const setter=Object.getOwnPropertyDescriptor(proto,"value")?.set;
      if(setter) setter.call(el,val); else el.value=val;
      el.dispatchEvent(new Event("input",{bubbles:true}));
      el.dispatchEvent(new Event("change",{bubbles:true}));
    };
    const match=(el,re)=>re.test(((el.placeholder||"")+" "+(el.name||"")+" "+(el.getAttribute("aria-label")||"")).toLowerCase());
    let nameSet=false, phoneSet=false, emailSet=false;
    for(const el of fields){
      if(!nameSet && match(el,/name|customer/)){set(el,${JSON.stringify(customerName)});nameSet=true;continue;}
      if(!phoneSet && match(el,/phone|mobile|contact/)){set(el,"9999900109");phoneSet=true;continue;}
      if(!emailSet && match(el,/email/)){set(el,"upgrade-e2e@example.com");emailSet=true;continue;}
    }
    if(!nameSet){
      const first=fields.find(el=>!el.value);
      if(first){set(first,${JSON.stringify(customerName)});nameSet=true;}
    }
    return JSON.stringify({nameSet,phoneSet,emailSet,values:fields.map(e=>e.value)});
  })()`));
  if (!filled.nameSet) throw new Error(`Customer name field could not be populated: ${JSON.stringify(filled)}`);

  await clickTarget(evaluate, "SAVE_CUSTOMER", ["save customer", "create customer", "save"]);
  await sleep(1800);
  const body = String(await evaluate(`(document.body?.innerText||"").slice(0,12000)`));
  if (!body.toLowerCase().includes(customerName.toLowerCase())) {
    throw new Error(`Persisted customer marker was not visible after save. Body=${body.slice(0,3000)}`);
  }
  const sqlite = JSON.parse(await evaluate(`(async()=>{
    const bytes=await window.minarvaDesktop.readSqliteBinary();
    return JSON.stringify({exists:await window.minarvaDesktop.sqliteExists(),bytes:bytes?.byteLength||0});
  })()`));
  if (!sqlite.exists || sqlite.bytes < 100) throw new Error(`SQLite persistence was not established: ${JSON.stringify(sqlite)}`);
  console.log(`CUSTOMER_PERSISTENCE PASS name=${customerName} sqliteBytes=${sqlite.bytes}`);
}

function writeResult(value) {
  fs.writeFileSync(resultPath, JSON.stringify(value, null, 2));
}

async function beforeUpgrade(evaluate) {
  const version = String(await evaluate(`window.minarvaDesktop.getVersion()`));
  if (version !== oldVersion) throw new Error(`Expected old version ${oldVersion}, got ${version}`);
  console.log(`OLD_VERSION PASS ${version}`);

  await ensureTrial(evaluate);
  await createPersistentCustomer(evaluate);

  const check = JSON.parse(await evaluate(
    `(async()=>JSON.stringify(await window.minarvaDesktop.checkForUpdates()))()`,
    90000,
  ));
  console.log(`UPDATE_CHECK ${JSON.stringify(check)}`);
  if (check.status !== "available" || check.currentVersion !== oldVersion || check.version !== newVersion) {
    throw new Error(`Old build did not discover ${newVersion}: ${JSON.stringify(check)}`);
  }

  const download = JSON.parse(await evaluate(
    `(async()=>JSON.stringify(await window.minarvaDesktop.downloadUpdate()))()`,
    300000,
  ));
  console.log(`UPDATE_DOWNLOAD ${JSON.stringify(download)}`);
  if (!download.ok || download.version !== newVersion || !download.installerPath) {
    throw new Error(`Update download/verification failed: ${JSON.stringify(download)}`);
  }
  if (!fs.existsSync(download.installerPath) || fs.statSync(download.installerPath).size < 10_000_000) {
    throw new Error(`Verified updater installer is missing or unexpectedly small: ${download.installerPath}`);
  }

  writeResult({ phase: "downloaded", oldVersion, newVersion, customerName, check, download });

  const install = JSON.parse(await evaluate(
    `(async()=>JSON.stringify(await window.minarvaDesktop.installUpdate()))()`,
    60000,
  ));
  console.log(`UPDATE_INSTALL_GATE ${JSON.stringify(install)}`);
  if (!install.ok || install.version !== newVersion || !install.backupPath) {
    throw new Error(`Safe install gate failed: ${JSON.stringify(install)}`);
  }
  if (!fs.existsSync(install.backupPath) || fs.statSync(install.backupPath).size < 100) {
    throw new Error(`Verified pre-update backup is missing: ${install.backupPath}`);
  }

  writeResult({ phase: "install-launched", oldVersion, newVersion, customerName, check, download, install });
  console.log(`UPDATER_OLD_TO_NEW_GATE PASS ${oldVersion} -> ${newVersion}`);
}

async function afterUpgrade(evaluate) {
  const version = String(await evaluate(`window.minarvaDesktop.getVersion()`));
  if (version !== newVersion) throw new Error(`Expected upgraded version ${newVersion}, got ${version}`);
  console.log(`NEW_VERSION PASS ${version}`);

  const trial = JSON.parse(await evaluate(`(async()=>JSON.stringify(await window.minarvaDesktop.getTrialState()))()`));
  if (trial.status !== "active") throw new Error(`Trial state was not preserved across upgrade: ${trial.status}`);

  await clickTarget(evaluate, "CUSTOMERS_AFTER", ["customers"]);
  const body = String(await evaluate(`(document.body?.innerText||"").slice(0,16000)`));
  if (!body.toLowerCase().includes(customerName.toLowerCase())) {
    throw new Error(`Customer data was not preserved across upgrade. Body=${body.slice(0,4000)}`);
  }
  console.log(`CUSTOMER_DATA_PRESERVED PASS ${customerName}`);

  const backups = JSON.parse(await evaluate(`(async()=>JSON.stringify(await window.minarvaDesktop.listBackups()))()`));
  const preUpdate = backups.find((item) => item.kind === "pre-update" && item.verified === true);
  if (!preUpdate) throw new Error(`Verified pre-update backup is not visible after upgrade: ${JSON.stringify(backups)}`);
  console.log(`PRE_UPDATE_BACKUP_PRESERVED PASS ${preUpdate.filename}`);

  const check = JSON.parse(await evaluate(
    `(async()=>JSON.stringify(await window.minarvaDesktop.checkForUpdates()))()`,
    90000,
  ));
  if (check.status !== "up_to_date" || check.currentVersion !== newVersion) {
    throw new Error(`Upgraded build does not report up-to-date: ${JSON.stringify(check)}`);
  }
  console.log(`UP_TO_DATE_AFTER_UPGRADE PASS ${JSON.stringify(check)}`);

  const sqlite = JSON.parse(await evaluate(`(async()=>{
    const bytes=await window.minarvaDesktop.readSqliteBinary();
    return JSON.stringify({exists:await window.minarvaDesktop.sqliteExists(),bytes:bytes?.byteLength||0});
  })()`));
  if (!sqlite.exists || sqlite.bytes < 100) throw new Error(`SQLite database missing after upgrade: ${JSON.stringify(sqlite)}`);

  const previous = fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath, "utf8")) : {};
  writeResult({ ...previous, phase: "verified", verifiedVersion: version, trialStatus: trial.status, preUpdateBackup: preUpdate, finalCheck: check, sqlite });
  console.log(`WINDOWS_UPGRADE_E2E PASS ${oldVersion} -> ${newVersion}`);
}

async function main() {
  const { ws, evaluate } = await connect();
  try {
    await waitForRendererReady(evaluate);
    if (mode === "before") await beforeUpgrade(evaluate);
    else if (mode === "after") await afterUpgrade(evaluate);
    else throw new Error(`Unknown mode: ${mode}`);
  } finally {
    try { ws.close(); } catch {}
  }
}

main().catch((error) => {
  console.error(`WINDOWS_UPGRADE_E2E FAIL mode=${mode}`);
  console.error(error?.stack || error);
  process.exit(1);
});
