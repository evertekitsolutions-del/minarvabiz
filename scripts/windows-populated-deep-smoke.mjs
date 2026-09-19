const base = "http://127.0.0.1:9222";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function json(path) { const r = await fetch(\`\${base}\${path}\`); if (!r.ok) throw new Error(\`CDP HTTP \${r.status}\`); return r.json(); }

let nextId = 0;
const pending = new Map();

async function connect() {
  let target;
  for (let i = 0; i < 30; i++) {
    try {
      const pages = await json("/json/list");
      target = pages.find((p) => p.type === "page" && p.webSocketDebuggerUrl);
      if (target) break;
    } catch {}
    await sleep(500);
  }
  if (!target) throw new Error("Electron renderer CDP target not found");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  ws.addEventListener("message", (event) => {
    try {
      const m = JSON.parse(event.data);
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      clearTimeout(p.timer);
      if (m.error) p.reject(new Error(m.error.message || "CDP error"));
      else p.resolve(m.result?.result?.value);
    } catch {}
  });
  return ws;
}

async function evalIn(ws, expression) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(\`CDP timeout: \${expression.slice(0, 100)}\`));
    }, 20000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
  });
}

async function ready(ws) {
  for (let i = 0; i < 60; i++) {
    const raw = await evalIn(ws, \`JSON.stringify({ready:document.documentElement.dataset.minarvaRendererReady==='true',error:document.documentElement.dataset.minarvaRendererError==='true',text:(document.body?.innerText||'').slice(0,1400)})\`);
    const s = JSON.parse(raw);
    if (s.error) throw new Error(\`Renderer startup error: \${s.text}\`);
    if (s.ready) return;
    await sleep(500);
  }
  throw new Error("Renderer did not become ready");
}

async function click(ws, name, patterns, wait = 650) {
  const raw = await evalIn(ws, \`(async()=>{const pats=\${JSON.stringify(patterns)};const els=[...document.querySelectorAll('button,a,[role="button"],tr')];const vis=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&!e.disabled};const txt=e=>((e.innerText||e.textContent||'')+' '+(e.getAttribute('aria-label')||'')).replace(/\\s+/g,' ').trim();const el=els.find(e=>vis(e)&&pats.some(p=>txt(e).toLowerCase().includes(String(p).toLowerCase())));if(!el)return JSON.stringify({ok:false,available:els.filter(vis).map(txt).filter(Boolean).slice(0,180)});el.click();await new Promise(r=>setTimeout(r,\${wait}));return JSON.stringify({ok:true,text:txt(el),main:(document.querySelector('[data-testid="app-content"]')?.innerText||'').slice(0,5000)});})()\`);
  const out = JSON.parse(raw);
  console.log(\`CLICK_\${name} \${raw}\`);
  if (!out.ok) throw new Error(\`Target \${name} not found: \${JSON.stringify(out.available)}\`);
  return out;
}

async function assertMain(ws, name, patterns) {
  const raw = await evalIn(ws, \`JSON.stringify((document.querySelector('[data-testid="app-content"]')?.innerText||'').slice(0,12000))\`);
  const value = JSON.parse(raw);
  const lower = value.toLowerCase();
  if (!patterns.every((p) => lower.includes(String(p).toLowerCase()))) {
    throw new Error(\`\${name} marker missing. Expected \${patterns.join(" + ")}. Main: \${value.slice(0,1400)}\`);
  }
  console.log(\`VIEW_\${name} PASS\`);
}

async function setField(ws, dialogName, labelText, value) {
  const raw = await evalIn(ws, \`(()=>{const dialogs=[...document.querySelectorAll('[role="dialog"]')];const d=dialogs.find(x=>(x.getAttribute('aria-label')||'').toLowerCase().includes(\${JSON.stringify(dialogName.toLowerCase())}));if(!d)return JSON.stringify({ok:false,error:'dialog not found',dialogs:dialogs.map(x=>x.getAttribute('aria-label'))});const labels=[...d.querySelectorAll('label')];const label=labels.find(x=>(x.innerText||'').toLowerCase().includes(\${JSON.stringify(labelText.toLowerCase())}));if(!label)return JSON.stringify({ok:false,error:'label not found',labels:labels.map(x=>(x.innerText||'').trim())});const el=label.querySelector('input,textarea,select');if(!el)return JSON.stringify({ok:false,error:'field not found'});const v=\${JSON.stringify(value)};if(el.tagName==='SELECT'){el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));}else{const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;setter?setter.call(el,v):el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}return JSON.stringify({ok:true,value:el.value});})()\`);
  const result = JSON.parse(raw);
  if (!result.ok) throw new Error(\`SET_FIELD \${dialogName}/\${labelText} failed: \${raw}\`);
}

async function selectFieldByText(ws, labelText, optionText) {
  const raw = await evalIn(ws, \`(()=>{const main=document.querySelector('[data-testid="app-content"]');const labels=[...(main?.querySelectorAll('label')||[])];const label=labels.find(x=>(x.innerText||'').toLowerCase().includes(\${JSON.stringify(labelText.toLowerCase())}));const el=label?.querySelector('select');if(!el)return JSON.stringify({ok:false,labels:labels.map(x=>(x.innerText||'').trim())});const option=[...el.options].find(o=>(o.textContent||'').toLowerCase().includes(\${JSON.stringify(optionText.toLowerCase())}));if(!option)return JSON.stringify({ok:false,options:[...el.options].map(o=>o.textContent)});el.value=option.value;el.dispatchEvent(new Event('change',{bubbles:true}));return JSON.stringify({ok:true,value:el.value,text:option.textContent});})()\`);
  const result = JSON.parse(raw);
  if (!result.ok) throw new Error(\`SELECT_FIELD \${labelText} -> \${optionText} failed: \${raw}\`);
}

async function setByPlaceholder(ws, placeholder, value) {
  const raw = await evalIn(ws, \`(()=>{const els=[...document.querySelectorAll('input,textarea')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0});const el=els.find(e=>(e.placeholder||'').toLowerCase().includes(\${JSON.stringify(placeholder.toLowerCase())}));if(!el)return JSON.stringify({ok:false,placeholders:els.map(e=>e.placeholder)});const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;setter?setter.call(el,\${JSON.stringify(value)}):el.value=\${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return JSON.stringify({ok:true,value:el.value});})()\`);
  const result = JSON.parse(raw);
  if (!result.ok) throw new Error(\`SET_PLACEHOLDER \${placeholder} failed: \${raw}\`);
}

async function main() {
  const ws = await connect();
  try {
    const info = await evalIn(ws, \`(async()=>JSON.stringify({version:await window.minarvaDesktop?.getVersion?.(),platform:window.minarvaDesktop?.platform}))()\`);
    console.log(\`APP_INFO \${info}\`);
    await ready(ws);
    console.log("RENDERER_READY PASS");

    const before = JSON.parse(await evalIn(ws, \`(async()=>{const a=window.minarvaDesktop;return JSON.stringify({device:await a.getDeviceId(),trialDevice:await a.getTrialDeviceId(),trial:await a.getTrialState()})})()\`));
    if (!/^[a-f0-9]{64}$/i.test(before.device)) throw new Error("Device ID is not 64-hex");
    if (before.device !== before.trialDevice) throw new Error("Device/trial device IDs differ");

    if (before.trial.status === "unactivated") {
      const activation = JSON.parse(await evalIn(ws, \`(async()=>JSON.stringify(await window.minarvaDesktop.activateTrial({email:'qa-\${Date.now()}@example.com',phone:'9999988888',organizationName:'Minarva Biz Interaction QA',address:'Windows CI Fresh Install'})))()\`));
      if (!activation.ok || activation.state?.status !== "active") throw new Error("Trial activation failed");
      await evalIn(ws, \`(async()=>{location.reload();return true})()\`);
      await sleep(1200);
      await ready(ws);
    }
    console.log("TRIAL_READY PASS");

    // Customer create + row drill-down.
    await click(ws, "CUSTOMERS", ["customers"]);
    await assertMain(ws, "CUSTOMERS", ["Customers", "Add Customer"]);
    await click(ws, "CUSTOMER_ADD", ["add customer"]);
    await setField(ws, "Add Customer", "Name", "QA POS Customer");
    await setField(ws, "Add Customer", "Phone", "9999900011");
    await setField(ws, "Add Customer", "Birthday", "1992-12-07");
    await click(ws, "CUSTOMER_SAVE", ["save customer"]);
    await assertMain(ws, "CUSTOMER_SAVED", ["QA POS Customer"]);
    await click(ws, "CUSTOMER_ROW", ["QA POS Customer"]);
    await assertMain(ws, "CUSTOMER_PROFILE", ["Customer CRM", "QA POS Customer"]);

    // Product create with category and opening stock.
    await click(ws, "PRODUCTS", ["products & inventory"]);
    await assertMain(ws, "PRODUCTS", ["Products & Inventory", "Add Product"]);
    await click(ws, "PRODUCT_ADD", ["add product"]);
    await setField(ws, "Add Product", "Product name", "QA POS Product");
    await setField(ws, "Add Product", "Barcode", "QA1001");
    await setField(ws, "Add Product", "Cost price", "60");
    await setField(ws, "Add Product", "Selling price", "100");
    await setField(ws, "Add Product", "Opening stock", "5");
    await setField(ws, "Add Product", "Minimum stock", "1");
    await click(ws, "PRODUCT_SAVE", ["save product"]);
    await assertMain(ws, "PRODUCT_SAVED", ["QA POS Product"]);

    // POS: select customer, add product card, complete a credit sale.
    await click(ws, "SALES", ["sales & billing"]);
    await assertMain(ws, "POS", ["POS Billing", "Current Sale", "QA POS Product"]);
    await selectFieldByText(ws, "Walk-in customer", "QA POS Customer").catch(async () => {
      const raw = await evalIn(ws, \`(()=>{const main=document.querySelector('[data-testid="app-content"]');const el=[...main.querySelectorAll('select')].find(s=>[...s.options].some(o=>(o.textContent||'').includes('QA POS Customer')));if(!el)return JSON.stringify({ok:false});const opt=[...el.options].find(o=>(o.textContent||'').includes('QA POS Customer'));el.value=opt.value;el.dispatchEvent(new Event('change',{bubbles:true}));return JSON.stringify({ok:true});})()\`);
      if (!JSON.parse(raw).ok) throw new Error("POS customer select failed");
    });
    await click(ws, "POS_PRODUCT", ["QA POS Product"]);
    const cartState = JSON.parse(await evalIn(ws, \`JSON.stringify({main:(document.querySelector('[data-testid="app-content"]')?.innerText||''),complete:[...document.querySelectorAll('button')].find(b=>(b.innerText||'').includes('Complete Sale'))?.disabled})\`));
    if (cartState.complete) throw new Error("Complete Sale remained disabled after adding a product");
    await click(ws, "COMPLETE_SALE", ["complete sale"]);
    await assertMain(ws, "SALE_COMPLETED", ["Sale completed"]);
    await click(ws, "SALES_HISTORY", ["sales history"]);
    await assertMain(ws, "SALES_HISTORY", ["Sales", "QA POS Customer"]);

    // Payment collection against the unpaid sale.
    await click(ws, "PAYMENTS", ["payments"]);
    await assertMain(ws, "PAYMENTS", ["Payments", "QA POS Customer", "100"]);
    await click(ws, "COLLECT_PAYMENT", ["collect"]);
    await setField(ws, "Collect payment", "Amount", "100");
    await click(ws, "RECORD_PAYMENT", ["record payment"]);
    await assertMain(ws, "PAYMENT_RECORDED", ["Payments", "No outstanding balances"]);

    // Return/refund with stock restock.
    await click(ws, "RETURNS", ["returns & refunds"]);
    await assertMain(ws, "RETURNS", ["Returns & Refunds", "New Return"]);
    await click(ws, "NEW_RETURN", ["new return"]);
    const returnSelect = await evalIn(ws, \`(()=>{const d=[...document.querySelectorAll('[role="dialog"]')].find(x=>(x.getAttribute('aria-label')||'').includes('Process return'));const s=d?.querySelector('select');if(!s||s.options.length<2)return JSON.stringify({ok:false,options:s?[...s.options].map(o=>o.textContent):[]});s.value=s.options[1].value;s.dispatchEvent(new Event('change',{bubbles:true}));return JSON.stringify({ok:true});})()\`);
    if (!JSON.parse(returnSelect).ok) throw new Error(\`Return invoice selection failed: \${returnSelect}\`);
    await sleep(300);
    const qty = await evalIn(ws, \`(()=>{const d=[...document.querySelectorAll('[role="dialog"]')].find(x=>(x.getAttribute('aria-label')||'').includes('Process return'));const i=d?.querySelector('input[type="number"]');if(!i)return JSON.stringify({ok:false});const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;setter.call(i,'1');i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));return JSON.stringify({ok:true});})()\`);
    if (!JSON.parse(qty).ok) throw new Error("Return quantity input missing");
    await click(ws, "PROCESS_REFUND", ["process refund"]);
    await assertMain(ws, "RETURN_RECORDED", ["Returns & Refunds", "QA POS Customer"]);

    // Expense create: default category must be real, not visually selected-only.
    await click(ws, "EXPENSES", ["expenses"]);
    await assertMain(ws, "EXPENSES", ["Expenses", "Add Expense"]);
    await click(ws, "ADD_EXPENSE", ["add expense"]);
    await setField(ws, "Add Expense", "Amount", "50");
    await setField(ws, "Add Expense", "Description", "QA interaction expense");
    await click(ws, "SAVE_EXPENSE", ["save expense"]);
    await assertMain(ws, "EXPENSE_SAVED", ["1 records", "QA interaction expense"]);

    // Supplier and purchase create.
    await click(ws, "SUPPLIERS", ["suppliers"]);
    await assertMain(ws, "SUPPLIERS", ["Suppliers", "Add Supplier"]);
    await click(ws, "ADD_SUPPLIER", ["add supplier"]);
    await setField(ws, "Add Supplier", "Supplier name", "QA Supplier");
    await setField(ws, "Add Supplier", "Phone", "9999900022");
    await click(ws, "SAVE_SUPPLIER", ["save supplier"]);
    await assertMain(ws, "SUPPLIER_SAVED", ["QA Supplier"]);

    await click(ws, "PURCHASES", ["purchases"]);
    await assertMain(ws, "PURCHASES", ["Purchases", "Add Purchase"]);
    await click(ws, "ADD_PURCHASE", ["add purchase"]);
    await setField(ws, "Add Purchase", "Description", "QA stock purchase");
    await setField(ws, "Add Purchase", "Amount", "500");
    await setField(ws, "Add Purchase", "Paid amount", "500");
    await click(ws, "SAVE_PURCHASE", ["save purchase"]);
    await assertMain(ws, "PURCHASE_SAVED", ["1 records", "QA stock purchase"]);

    // Staff create + row drill-down.
    await click(ws, "STAFF", ["staff management"]);
    await assertMain(ws, "STAFF", ["Staff Management", "Add Staff"]);
    await click(ws, "ADD_STAFF", ["add staff"]);
    await setField(ws, "Add Staff", "Full name", "QA Tailor");
    await setField(ws, "Add Staff", "Salary", "15000");
    await click(ws, "SAVE_STAFF", ["save staff"]);
    await assertMain(ws, "STAFF_SAVED", ["QA Tailor"]);
    await click(ws, "STAFF_ROW", ["QA Tailor"]);
    await assertMain(ws, "STAFF_DETAIL", ["Staff Details", "QA Tailor"]);

    // Laundry action must open a real data-entry modal.
    await click(ws, "LAUNDRY", ["laundry & ironing"]);
    await assertMain(ws, "LAUNDRY", ["Laundry & Ironing", "Outsourced Laundry"]);
    await click(ws, "ADD_LAUNDRY", ["outsourced laundry"]);
    const laundryDialog = JSON.parse(await evalIn(ws, \`JSON.stringify([...document.querySelectorAll('[role="dialog"]')].map(x=>x.getAttribute('aria-label')))\`));
    if (!laundryDialog.some((x) => /outsourced laundry/i.test(x || ""))) throw new Error("Outsourced laundry modal did not open");
    await click(ws, "CANCEL_LAUNDRY", ["cancel"]);

    // Day-end action: content assertion is scoped to main, not sidebar.
    await click(ws, "DAY_END", ["day-end close"]);
    await assertMain(ws, "DAY_END", ["Day-end close", "Close today"]);
    await click(ws, "CLOSE_TODAY", ["close today"]);
    await assertMain(ws, "DAY_END_CLOSED", ["Day-end close", "Net profit"]);

    // Notifications and report callbacks.
    await click(ws, "NOTIFICATIONS", ["messages & notifications", "notifications"]);
    await assertMain(ws, "NOTIFICATIONS", ["Notifications"]);
    const mark = JSON.parse(await evalIn(ws, \`(async()=>{const main=document.querySelector('[data-testid="app-content"]');const el=[...main.querySelectorAll('button')].find(e=>/mark all read/i.test(e.innerText||''));if(!el)return JSON.stringify({found:false});el.click();await new Promise(r=>setTimeout(r,400));return JSON.stringify({found:true})})()\`));
    if (!mark.found) throw new Error("Notifications mark-all-read callback missing");

    await click(ws, "REPORTS", ["reports & analytics"]);
    await assertMain(ws, "REPORTS", ["Reports & Analytics", "Refresh"]);
    await click(ws, "REPORT_REFRESH", ["refresh"]);

    // Command/global search opens and routes.
    await click(ws, "COMMAND_PALETTE", ["open command palette", "quick commands"]);
    const dialogs = JSON.parse(await evalIn(ws, \`JSON.stringify([...document.querySelectorAll('[role="dialog"]')].map(x=>x.getAttribute('aria-label')))\`));
    if (!dialogs.some((x) => /command palette/i.test(x || ""))) throw new Error("Command palette did not open");
    await evalIn(ws, \`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true\`);

    console.log("WINDOWS_INTERACTION_AUDIT PASS");
  } finally {
    ws.close();
  }
}

main().catch((e) => {
  console.error(\`WINDOWS_INTERACTION_AUDIT FAIL: \${e instanceof Error ? e.stack || e.message : String(e)}\`);
  process.exit(1);
});
