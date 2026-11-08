/**
 * Narrow CDP gate for isolated, Windows GitHub runner only.
 * Verifies synthetic trial identity and packaged Electron startup before/after
 * an in-place NSIS test install. Does not touch customer accounts or licenses.
 */
import assert from "node:assert/strict";

if (process.env.GITHUB_ACTIONS !== "true" ||
    process.env.MINARVA_ISOLATED_UPGRADE_LAB !== "1" ||
    !["activate","verify"].includes(process.argv[2]) ||
    !/^\d+\.\d+\.\d+$/.test(process.env.EXPECTED_APP_VERSION || "")) {
  throw new Error("Refusing CDP access outside isolated Windows lab");
}
const mode = process.argv[2];
const expected = process.env.EXPECTED_APP_VERSION;
const port = Number(process.env.MINARVA_CDP_PORT || "9228");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let target;
for (let tries = 0; tries < 60; tries++) {
  try {
    const response = await fetch("http://127.0.0.1:" + port + "/json/list");
    if (response.ok) {
      const pages = await response.json();
      target = pages.find((page) => page.type === "page" && page.webSocketDebuggerUrl);
      if (target) break;
    }
  } catch {}
  await sleep(500);
}
if (!target) throw new Error("Packaged Electron CDP page not reachable");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, {once:true});
  ws.addEventListener("error", reject, {once:true});
});
let id = 0;
const pending = new Map();
ws.addEventListener("message", ({data}) => {
  let msg;
  try { msg = JSON.parse(String(data)); } catch { return; }
  const request = pending.get(msg.id);
  if (!request) return;
  pending.delete(msg.id);
  clearTimeout(request.timer);
  if (msg.error || msg.result?.exceptionDetails) {
    request.reject(new Error(msg.error?.message || msg.result?.exceptionDetails?.text || "Renderer CDP exception"));
  } else request.resolve(msg.result?.result?.value);
});
async function evaluate(code) {
  return new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error("CDP evaluation timeout")); }, 30000);
    pending.set(key,{resolve,reject,timer});
    ws.send(JSON.stringify({id:key,method:"Runtime.evaluate",params:{expression:code,awaitPromise:true,returnByValue:true}}));
  });
}
async function ready() {
  for (let i=0;i<90;i++) {
    try {
      const state = JSON.parse(await evaluate(
        "JSON.stringify({ready:document.documentElement.dataset.minarvaRendererReady==='true',error:document.documentElement.dataset.minarvaRendererError==='true',text:(document.body?.innerText||'').slice(0,300)})"
      ));
      if (state.error) throw new Error("Packaged renderer initialization failed: " + state.text);
      if (state.ready) return;
    } catch (error) {
      if (String(error?.message).includes("initialization failed")) throw error;
    }
    await sleep(350);
  }
  throw new Error("Packaged Electron renderer did not become ready");
}
try {
  const version = await evaluate("window.minarvaDesktop.getVersion()");
  assert.equal(version, expected, "Exact installed source/candidate app version required");
  const state = JSON.parse(await evaluate("(async()=>JSON.stringify(await window.minarvaDesktop.getTrialState()))()"));
  if (mode === "activate") {
    assert.equal(state.status, "unactivated", "Fresh isolated runner must not already contain a trial");
    const raw = await evaluate("(async()=>JSON.stringify(await window.minarvaDesktop.activateTrial("+
      "{email:'ci-upgrade-lab@example.test',phone:'9999900997',"+
      "organizationName:'Minarva Synthetic Upgrade Lab',address:'Ephemeral GitHub Windows Runner'})))()");
    const activated = JSON.parse(raw);
    if (!activated.ok || activated.state?.status !== "active") {
      throw new Error("Isolated activation did not succeed: " + String(activated.error || activated.state?.status));
    }
    await evaluate("(async()=>{location.reload();return true})()");
    await sleep(1000);
    await ready();
    const after = JSON.parse(await evaluate("(async()=>JSON.stringify(await window.minarvaDesktop.getTrialState()))()"));
    assert.equal(after.status, "active");
    console.log("ISOLATED_SOURCE_TRIAL_ACTIVATED PASS "+expected);
  } else {
    assert.equal(state.status, "active", "Upgrade cannot reset trial identity or licensing");
    await ready();
    console.log("ISOLATED_UPGRADE_TRIAL_AND_RENDERER_PASS "+expected);
  }
} finally {
  ws.close();
}
