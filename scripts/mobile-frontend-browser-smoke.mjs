// Real headless Chrome mobile navigation and search acceptance using the CI browser.
// No customer data, tokens or paid browser service are required.
import assert from "node:assert/strict";

const appBase = process.env.MINARVA_WEB_BASE || "http://127.0.0.1:3000";
const cdpBase = process.env.MINARVA_WEB_CDP || "http://127.0.0.1:9223";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let nextId = 0;

async function connect() {
  let page;
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(cdpBase + "/json/list");
      const targets = await response.json();
      page = targets.find(t => t.type === "page" && t.webSocketDebuggerUrl && t.url.startsWith(appBase));
      if (page) break;
    } catch {}
    await sleep(500);
  }
  if (!page) throw new Error("Chrome page target unavailable for frontend browser test");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const inflight = new Map();
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  ws.addEventListener("message", event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    const pending = inflight.get(message.id);
    if (!pending) return;
    inflight.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) return pending.reject(new Error(message.error.message));
    if (message.result?.exceptionDetails) {
      return pending.reject(new Error(message.result.exceptionDetails.exception?.description || "Browser evaluation error"));
    }
    pending.resolve(message.result?.result?.value ?? message.result);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { inflight.delete(id); reject(new Error("CDP timeout " + method)); }, 25000);
    inflight.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = expr => call("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  return { ws, call, evaluate };
}

async function waitFor(evaluate, expr, description, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await evaluate(expr).catch(() => false)) return;
    await sleep(300);
  }
  throw new Error("Timed out waiting for " + description);
}

const browser = await connect();
try {
  await browser.call("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  await browser.evaluate(`location.assign(${JSON.stringify(appBase + "/dashboard")})`);
  const mobileNav = 'document.querySelector(\'nav[aria-label="Mobile quick navigation"]\')';
  const visible = '(el => !!el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0)';
  await waitFor(browser.evaluate, `${visible}(${mobileNav})`, "mobile navigation");
  assert.equal(await browser.evaluate(`${mobileNav}.querySelectorAll("button").length`), 5);
  assert.equal(await browser.evaluate(`${mobileNav}.querySelector('button[aria-current="page"]')?.innerText.trim()`), "Home");

  await browser.evaluate(`[...${mobileNav}.querySelectorAll("button")].find(b => b.textContent.trim() === "Sales").click()`);
  await waitFor(browser.evaluate, 'location.pathname === "/sales"', "mobile Sales navigation");
  await waitFor(browser.evaluate, `${mobileNav}.querySelector('button[aria-current="page"]')?.innerText.trim() === "Sales"`, "Sales active state");

  await browser.evaluate(`[...${mobileNav}.querySelectorAll("button")].find(b => b.textContent.trim() === "Products").click()`);
  await waitFor(browser.evaluate, 'location.pathname === "/products"', "mobile Products navigation");
  await waitFor(browser.evaluate, `${mobileNav}.querySelector('button[aria-current="page"]')?.innerText.trim() === "Products"`, "Products active state");


  await browser.evaluate(`${mobileNav}.querySelector('button[aria-label="More modules"]').click()`);
  await waitFor(browser.evaluate, '!!document.querySelector(\'[role="dialog"][aria-label="Navigation menu"]\')', "mobile full menu");
  assert.equal(await browser.evaluate(`${mobileNav}.querySelector('button[aria-label="More modules"]').getAttribute("aria-expanded")`), "true");
  await browser.evaluate(`document.querySelector('button[aria-label="Close navigation menu"]').click()`);
  await waitFor(browser.evaluate, '!document.querySelector(\'[role="dialog"][aria-label="Navigation menu"]\')', "mobile menu close");

  await browser.evaluate('document.querySelector(\'button[aria-label="Search records"]\').click()');
  const searchSelector = 'input[aria-label="Search customers, orders, products and invoices on mobile"]';
  await waitFor(browser.evaluate, `!!document.querySelector(${JSON.stringify(searchSelector)})`, "mobile search input");
  await browser.evaluate(`document.querySelector(${JSON.stringify(searchSelector)}).focus()`);
  await browser.call("Input.insertText", { text: "zzzz-front-end-not-found-918273" });
  await waitFor(browser.evaluate, '!!document.querySelector(\'[role="region"][aria-label="Global search results"]\')', "mobile search result region");
  await browser.evaluate('document.querySelector(\'button[aria-label="Close mobile search"]\').click()');
  await waitFor(browser.evaluate, `!document.querySelector(${JSON.stringify(searchSelector)})`, "mobile search dismissal");

  await browser.call("Emulation.setDeviceMetricsOverride", {
    width: 1280, height: 900, deviceScaleFactor: 1, mobile: false,
  });
  await waitFor(browser.evaluate, `getComputedStyle(${mobileNav}).display === "none"`, "desktop hides quick navigation");
  assert.equal(await browser.evaluate(`[...document.querySelectorAll('input[aria-label="Search customers, orders, products and invoices"]')].some(el => el.getBoundingClientRect().width > 0)`), true);
  console.log("FRONTEND-01 Chrome mobile navigation, full menu, accessible search and desktop parity PASS");
} finally {
  try { await browser.call("Emulation.clearDeviceMetricsOverride"); } catch {}
  browser.ws.close();
}
