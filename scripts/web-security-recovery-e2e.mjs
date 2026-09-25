const cdpBase = process.env.MINARVA_WEB_CDP || "http://127.0.0.1:9224";
const appBase = process.env.MINARVA_WEB_BASE || "http://127.0.0.1:3000";
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
      target = pages.find(
        (page) =>
          page.type === "page" &&
          page.webSocketDebuggerUrl &&
          typeof page.url === "string" &&
          page.url.startsWith(appBase),
      );
      if (target) break;
    } catch {}
    await sleep(500);
  }
  if (!target) throw new Error("Browser security E2E CDP target not found");

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

async function evalIn(ws, expression, timeout = 20000) {
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

async function waitFor(ws, predicate, label, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await evalIn(ws, predicate);
    if (value) return;
    await sleep(250);
  }
  const state = await evalIn(
    ws,
    `JSON.stringify({href:location.href,text:(document.body?.innerText||"").slice(0,1800)})`,
  );
  throw new Error(`${label} timed out: ${state}`);
}

async function navigate(ws, path) {
  await evalIn(ws, `location.href=${JSON.stringify(appBase)}+${JSON.stringify(path)}`);
}

async function setInputByLabel(ws, label, value) {
  const result = await evalIn(ws, `(()=>{const wanted=${JSON.stringify(label.toLowerCase())};const l=[...document.querySelectorAll('label')].find(x=>(x.innerText||'').toLowerCase().includes(wanted));const el=l?.querySelector('input,textarea');if(!el)return JSON.stringify({ok:false,labels:[...document.querySelectorAll('label')].map(x=>(x.innerText||'').trim())});const setter=Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')?.set;setter?setter.call(el,${JSON.stringify(value)}):el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return JSON.stringify({ok:true});})()`);
  if (!JSON.parse(result).ok) throw new Error(`Input not found: ${label}: ${result}`);
}

async function clickButton(ws, text) {
  const result = await evalIn(ws, `(()=>{const wanted=${JSON.stringify(text.toLowerCase())};const button=[...document.querySelectorAll('button')].find(b=>!b.disabled&&(b.innerText||'').toLowerCase().includes(wanted));if(!button)return JSON.stringify({ok:false,buttons:[...document.querySelectorAll('button')].map(b=>({text:(b.innerText||'').trim(),disabled:b.disabled}))});button.click();return JSON.stringify({ok:true});})()`);
  if (!JSON.parse(result).ok) throw new Error(`Button not found/enabled: ${text}: ${result}`);
}

async function run() {
  const ws = await connect();
  try {
    await waitFor(
      ws,
      `location.pathname==="/login" && (document.body?.innerText||"").includes("Sign in to continue")`,
      "unauthenticated protected-route redirect",
    );
    console.log("BROWSER_AUTH_NEGATIVE unauthenticated redirect PASS");

    await evalIn(ws, `sessionStorage.setItem("minarva_session","forged-token");sessionStorage.setItem("minarva_user","not-json");location.href=${JSON.stringify(appBase + "/dashboard")}`);
    await waitFor(ws, `location.pathname==="/login"`, "malformed session rejection");
    const malformedCleared = await evalIn(ws, `sessionStorage.getItem("minarva_session")===null&&sessionStorage.getItem("minarva_user")===null`);
    if (!malformedCleared) throw new Error("Malformed session was not cleared");
    console.log("BROWSER_AUTH_NEGATIVE malformed session PASS");

    await evalIn(ws, `sessionStorage.setItem("minarva_session","invalid-e2e-access-token");sessionStorage.setItem("minarva_user",JSON.stringify({id:"11111111-1111-1111-1111-111111111111",email:"e2e@example.test",fullName:"Forged",role:"admin"}));location.href=${JSON.stringify(appBase + "/dashboard")}`);
    await waitFor(ws, `location.pathname==="/login"`, "server-side token rejection");
    const invalidCleared = await evalIn(ws, `sessionStorage.getItem("minarva_session")===null&&sessionStorage.getItem("minarva_user")===null`);
    if (!invalidCleared) throw new Error("Server-rejected session was not cleared");
    console.log("BROWSER_AUTH_NEGATIVE forged token PASS");

    await evalIn(ws, `sessionStorage.setItem("minarva_session","valid-e2e-access-token");sessionStorage.setItem("minarva_user",JSON.stringify({id:"11111111-1111-1111-1111-111111111111",email:"e2e@example.test",fullName:"E2E User",role:"admin"}));location.href=${JSON.stringify(appBase + "/dashboard")}`);
    await waitFor(
      ws,
      `location.pathname==="/dashboard" && (document.body?.innerText||"").includes("Total Sales")`,
      "valid online session recovery",
      45000,
    );
    console.log("BROWSER_AUTH_RECOVERY valid session PASS");

    await evalIn(ws, `sessionStorage.clear();location.href=${JSON.stringify(appBase + "/reset-password")}`);
    await waitFor(
      ws,
      `location.pathname==="/reset-password" && (document.body?.innerText||"").includes("missing its access token")`,
      "missing recovery token state",
    );
    const disabled = await evalIn(ws, `[...document.querySelectorAll("button")].some(b=>(b.innerText||"").includes("Update password")&&b.disabled)`);
    if (!disabled) throw new Error("Password reset submit must be disabled without a recovery token");
    console.log("BROWSER_RECOVERY_NEGATIVE missing token PASS");

    await navigate(
      ws,
      "/reset-password?access_token=query-secret&refresh_token=query-refresh-secret&keep=1#access_token=valid-e2e-access-token&refresh_token=hash-secret&type=recovery",
    );
    await waitFor(ws, `location.pathname==="/reset-password" && !location.href.includes("access_token") && !location.href.includes("refresh_token")`, "recovery URL secret scrubbing");
    const sanitized = String(await evalIn(ws, "location.href"));
    if (!sanitized.includes("keep=1") || !sanitized.includes("type=recovery")) {
      throw new Error(`Recovery URL scrub removed non-secret state: ${sanitized}`);
    }
    console.log("BROWSER_RECOVERY_SECURITY token URL scrub PASS");

    await setInputByLabel(ws, "New password", "StrongPass1!");
    await setInputByLabel(ws, "Confirm password", "Different1!");
    await clickButton(ws, "Update password");
    await waitFor(ws, `(document.body?.innerText||"").includes("Passwords do not match.")`, "password mismatch validation");
    console.log("BROWSER_RECOVERY_NEGATIVE password mismatch PASS");

    await setInputByLabel(ws, "Confirm password", "StrongPass1!");
    await clickButton(ws, "Update password");
    await waitFor(ws, `(document.body?.innerText||"").includes("Password updated successfully.")`, "password recovery success");
    console.log("BROWSER_RECOVERY_PATH password update PASS");

    await navigate(ws, "/forgot-password");
    await waitFor(ws, `location.pathname==="/forgot-password" && (document.body?.innerText||"").includes("Send reset link")`, "forgot password page");
    await setInputByLabel(ws, "Email", "unknown-account@example.test");
    await clickButton(ws, "Send reset link");
    await waitFor(
      ws,
      `(document.body?.innerText||"").includes("If this email belongs to an online Minarva Biz account")`,
      "generic password recovery response",
    );
    const body = String(await evalIn(ws, "document.body?.innerText||''"));
    if (/account (exists|does not exist)|email (exists|not found)/i.test(body)) {
      throw new Error("Password recovery response leaks account existence");
    }
    console.log("BROWSER_RECOVERY_SECURITY enumeration-safe response PASS");

    console.log("Browser E2E security-negative and recovery-path suite PASS");
  } finally {
    ws.close();
  }
}

run().catch((error) => {
  console.error("BROWSER_SECURITY_RECOVERY_E2E FAIL");
  console.error(error?.stack || error);
  process.exit(1);
});
