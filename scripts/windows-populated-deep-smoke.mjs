import { verifyPrintTemplates } from "./print-template-ui-smoke.mjs";
const base = "http://127.0.0.1:9222";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function json(path) { const r = await fetch(`${base}${path}`); if (!r.ok) throw new Error(`CDP HTTP ${r.status}`); return r.json(); }

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
      else if (m.result?.exceptionDetails) p.reject(new Error(m.result.exceptionDetails.exception?.description || m.result.exceptionDetails.text || "Renderer evaluation failed"));
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
      reject(new Error(`CDP timeout: ${expression.slice(0, 100)}`));
    }, 20000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
  });
}

async function cdp(ws, method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 20000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function typeFieldLikeUser(ws, dialogName, labelText, value) {
  const focused = JSON.parse(await evalIn(ws, `(()=>{const d=[...document.querySelectorAll('[role="dialog"]')].find(x=>(x.getAttribute('aria-label')||'').toLowerCase().includes(${JSON.stringify(dialogName.toLowerCase())}));const label=[...(d?.querySelectorAll('label')||[])].find(x=>(x.innerText||'').toLowerCase().includes(${JSON.stringify(labelText.toLowerCase())}));const el=label?.querySelector('input,textarea');if(!el)return JSON.stringify({ok:false});el.focus();const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')?.set?.call(el,'');el.dispatchEvent(new Event('input',{bubbles:true}));return JSON.stringify({ok:true});})()`));
  if (!focused.ok) throw new Error(`TYPE_FIELD ${dialogName}/${labelText}: focus failed`);
  await cdp(ws, "Input.insertText", { text: value });
  await sleep(120);
  const actual = JSON.parse(await evalIn(ws, `JSON.stringify(document.activeElement?.value ?? "")`));
  if (actual !== value) throw new Error(`TYPE_FIELD ${dialogName}/${labelText}: expected ${value}, got ${actual}`);
  console.log(`REAL_KEYBOARD_${labelText.replace(/\s+/g, "_").toUpperCase()} PASS`);
}

async function ready(ws) {
  for (let i = 0; i < 60; i++) {
    const raw = await evalIn(ws, `JSON.stringify({ready:document.documentElement.dataset.minarvaRendererReady==='true',error:document.documentElement.dataset.minarvaRendererError==='true',text:(document.body?.innerText||'').slice(0,1400)})`);
    const s = JSON.parse(raw);
    if (s.error) throw new Error(`Renderer startup error: ${s.text}`);
    if (s.ready) return;
    await sleep(500);
  }
  throw new Error("Renderer did not become ready");
}

async function click(ws, name, patterns, wait = 650) {
  const raw = await evalIn(ws, `(async()=>{
    const pats=${JSON.stringify(patterns)};
    const vis=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&!e.disabled};
    const txt=e=>((e.innerText||e.textContent||'')+' '+(e.getAttribute('aria-label')||'')).replace(/\\s+/g,' ').trim();
    const matches=e=>vis(e)&&pats.some(p=>txt(e).toLowerCase().includes(String(p).toLowerCase()));
    const findSidebar=()=>[...document.querySelectorAll('aside button,aside a,aside [role="button"]')].find(matches);
    const findAny=()=>[...document.querySelectorAll('button,a,[role="button"],tr')].find(matches);
    let el=findSidebar();
    if(!el){
      const groups=[...document.querySelectorAll('aside button[aria-expanded]')].filter(vis).map(txt);
      for(const groupLabel of groups){
        const group=[...document.querySelectorAll('aside button[aria-expanded]')].find(e=>vis(e)&&txt(e)===groupLabel);
        if(group&&group.getAttribute('aria-expanded')!=='true'){group.click();await new Promise(r=>setTimeout(r,100));}
        el=findSidebar();
        if(el)break;
      }
    }
    if(!el)el=findAny();
    if(!el){const els=[...document.querySelectorAll('button,a,[role="button"],tr')];return JSON.stringify({ok:false,available:els.filter(vis).map(txt).filter(Boolean).slice(0,180)});}
    el.click();
    await new Promise(r=>setTimeout(r,${wait}));
    return JSON.stringify({ok:true,text:txt(el),main:(document.querySelector('[data-testid="app-content"]')?.innerText||'').slice(0,5000)});
  })()`);
  const out = JSON.parse(raw);
  console.log(`CLICK_${name} ${raw}`);
  if (!out.ok) throw new Error(`Target ${name} not found: ${JSON.stringify(out.available)}`);
  return out;
}

async function clickButton(ws, name, patterns, wait = 650) {
  const raw = await evalIn(ws, `(async()=>{const pats=${JSON.stringify(patterns)};const els=[...document.querySelectorAll('button,[role="button"]')];const vis=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&!e.disabled};const txt=e=>((e.innerText||e.textContent||'')+' '+(e.getAttribute('aria-label')||'')).replace(/\\s+/g,' ').trim();const el=els.find(e=>vis(e)&&pats.some(p=>txt(e).toLowerCase().includes(String(p).toLowerCase())));if(!el)return JSON.stringify({ok:false,available:els.filter(vis).map(txt).filter(Boolean).slice(0,180)});el.click();await new Promise(r=>setTimeout(r,${wait}));return JSON.stringify({ok:true,text:txt(el),main:(document.querySelector('[data-testid="app-content"]')?.innerText||'').slice(0,5000)});})()`);
  const out = JSON.parse(raw);
  console.log(`CLICK_BUTTON_${name} ${raw}`);
  if (!out.ok) throw new Error(`Button target ${name} not found: ${JSON.stringify(out.available)}`);
  return out;
}

async function clickRowButton(ws, name, rowText, buttonText, wait = 650) {
  const raw = await evalIn(ws, `(async()=>{const row=[...document.querySelectorAll('tbody tr')].find(r=>(r.innerText||'').toLowerCase().includes(${JSON.stringify(rowText.toLowerCase())}));if(!row)return JSON.stringify({ok:false,error:'row'});const button=[...row.querySelectorAll('button,[role="button"]')].find(b=>((b.innerText||b.textContent||'')+' '+(b.getAttribute('aria-label')||'')).toLowerCase().includes(${JSON.stringify(buttonText.toLowerCase())})&&!b.disabled);if(!button)return JSON.stringify({ok:false,error:'button',available:[...row.querySelectorAll('button,[role="button"]')].map(b=>(b.innerText||b.textContent||'').trim())});button.click();await new Promise(r=>setTimeout(r,${wait}));return JSON.stringify({ok:true,text:(button.innerText||button.textContent||'').trim(),main:(document.querySelector('[data-testid="app-content"]')?.innerText||'').slice(0,5000)});})()`);
  const out = JSON.parse(raw);
  console.log(`ROW_BUTTON_${name} ${raw}`);
  if (!out.ok) throw new Error(`Row button ${name} not found: ${raw}`);
  return out;
}

async function assertMain(ws, name, patterns) {
  const raw = await evalIn(ws, `JSON.stringify((document.querySelector('[data-testid="app-content"]')?.innerText||'').slice(0,12000))`);
  const value = JSON.parse(raw);
  const lower = value.toLowerCase();
  if (!patterns.every((p) => lower.includes(String(p).toLowerCase()))) {
    throw new Error(`${name} marker missing. Expected ${patterns.join(" + ")}. Main: ${value.slice(0,1400)}`);
  }
  console.log(`VIEW_${name} PASS`);
}

// Check cart state rather than matching product text already visible in the catalog.
async function assertCart(ws, name, empty) {
  const state = JSON.parse(await evalIn(ws, `JSON.stringify((()=>{const main=document.querySelector('[data-testid="app-content"]');const button=[...(main?.querySelectorAll('button')||[])].find(b=>(b.innerText||'').trim()==='Complete Sale');return {found:!!button,disabled:button?.disabled,empty:(main?.innerText||'').includes('Cart is empty')};})())`));
  if (!state.found || state.disabled !== empty || state.empty !== empty) throw new Error(`${name}: unexpected cart state ${JSON.stringify(state)}`);
  console.log(`CART_${name} PASS`);
}

async function setField(ws, dialogName, labelText, value) {
  const raw = await evalIn(ws, `(()=>{const dialogs=[...document.querySelectorAll('[role="dialog"]')];const d=dialogs.find(x=>(x.getAttribute('aria-label')||'').toLowerCase().includes(${JSON.stringify(dialogName.toLowerCase())}));if(!d)return JSON.stringify({ok:false,error:'dialog not found',dialogs:dialogs.map(x=>x.getAttribute('aria-label'))});const labels=[...d.querySelectorAll('label')];const label=labels.find(x=>(x.innerText||'').toLowerCase().includes(${JSON.stringify(labelText.toLowerCase())}));if(!label)return JSON.stringify({ok:false,error:'label not found',labels:labels.map(x=>(x.innerText||'').trim())});const el=label.querySelector('input,textarea,select');if(!el)return JSON.stringify({ok:false,error:'field not found'});const v=${JSON.stringify(value)};if(el.tagName==='SELECT'){el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));}else{const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;setter?setter.call(el,v):el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}return JSON.stringify({ok:true,value:el.value});})()`);
  const result = JSON.parse(raw);
  if (!result.ok) throw new Error(`SET_FIELD ${dialogName}/${labelText} failed: ${raw}`);
}

async function selectDialogFieldByText(ws, dialogName, labelText, optionText) {
  const raw = await evalIn(ws, `(()=>{const dialogs=[...document.querySelectorAll('[role="dialog"]')];const d=dialogs.find(x=>(x.getAttribute('aria-label')||'').toLowerCase().includes(${JSON.stringify(dialogName.toLowerCase())}));if(!d)return JSON.stringify({ok:false,error:'dialog not found'});const labels=[...d.querySelectorAll('label')];const label=labels.find(x=>(x.innerText||'').toLowerCase().includes(${JSON.stringify(labelText.toLowerCase())}));const el=label?.querySelector('select');if(!el)return JSON.stringify({ok:false,error:'select not found',labels:labels.map(x=>(x.innerText||'').trim())});const option=[...el.options].find(o=>(o.textContent||'').toLowerCase().includes(${JSON.stringify(optionText.toLowerCase())}));if(!option)return JSON.stringify({ok:false,error:'option not found',options:[...el.options].map(o=>o.textContent)});el.value=option.value;el.dispatchEvent(new Event('change',{bubbles:true}));return JSON.stringify({ok:true,value:el.value,text:option.textContent});})()`);
  const result = JSON.parse(raw);
  if (!result.ok) throw new Error(`SELECT_DIALOG_FIELD ${dialogName}/${labelText} -> ${optionText} failed: ${raw}`);
}

async function clickDialogButton(ws, name, dialogName, buttonText, wait = 650) {
  const raw = await evalIn(ws, `(async()=>{const dialogs=[...document.querySelectorAll('[role="dialog"]')];const d=dialogs.find(x=>(x.getAttribute('aria-label')||'').toLowerCase().includes(${JSON.stringify(dialogName.toLowerCase())}));if(!d)return JSON.stringify({ok:false,error:'dialog not found'});const button=[...d.querySelectorAll('button,[role="button"]')].find(b=>((b.innerText||b.textContent||'')+' '+(b.getAttribute('aria-label')||'')).toLowerCase().includes(${JSON.stringify(buttonText.toLowerCase())})&&!b.disabled);if(!button)return JSON.stringify({ok:false,error:'button not found',buttons:[...d.querySelectorAll('button,[role="button"]')].map(b=>(b.innerText||b.textContent||'').trim())});button.click();await new Promise(r=>setTimeout(r,${wait}));return JSON.stringify({ok:true,text:(button.innerText||button.textContent||'').trim()});})()`);
  const out = JSON.parse(raw);
  console.log(`DIALOG_BUTTON_${name} ${raw}`);
  if (!out.ok) throw new Error(`Dialog button ${name} not found: ${raw}`);
  return out;
}

async function setMainField(ws, labelText, value) {
  const raw = await evalIn(ws, `(()=>{const main=document.querySelector('[data-testid="app-content"]');const labels=[...(main?.querySelectorAll('label')||[])];const label=labels.find(x=>(x.innerText||'').toLowerCase().includes(${JSON.stringify(labelText.toLowerCase())}));const el=label?.querySelector('input,textarea,select');if(!el)return JSON.stringify({ok:false,labels:labels.map(x=>(x.innerText||'').trim())});const v=${JSON.stringify(value)};if(el.tagName==='SELECT'){el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));}else{const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;setter?setter.call(el,v):el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}return JSON.stringify({ok:true,value:el.value});})()`);
  const result = JSON.parse(raw);
  if (!result.ok) throw new Error(`SET_MAIN_FIELD ${labelText} failed: ${raw}`);
}

async function assertMainFieldValue(ws, labelText, expected) {
  const raw = await evalIn(ws, `(()=>{const main=document.querySelector('[data-testid="app-content"]');const labels=[...(main?.querySelectorAll('label')||[])];const label=labels.find(x=>(x.innerText||'').toLowerCase().includes(${JSON.stringify(labelText.toLowerCase())}));const el=label?.querySelector('input,textarea,select');return JSON.stringify({ok:!!el,value:el?.value||''});})()`);
  const result = JSON.parse(raw);
  if (!result.ok || result.value !== expected) throw new Error(`MAIN_FIELD ${labelText} expected ${expected}, got ${result.value}`);
  console.log(`FIELD_${labelText.replace(/\s+/g,"_").toUpperCase()} PASS`);
}

async function selectFieldByText(ws, labelText, optionText) {
  const raw = await evalIn(ws, `(()=>{const main=document.querySelector('[data-testid="app-content"]');const labels=[...(main?.querySelectorAll('label')||[])];const wanted=${JSON.stringify(labelText.toLowerCase())};const matching=labels.filter(x=>x.querySelector('select')&&(x.innerText||'').toLowerCase().includes(wanted));const exact=matching.find(x=>{const first=(x.childNodes?.[0]?.textContent||'').trim().toLowerCase();return first===wanted;});const label=exact||matching[0];const el=label?.querySelector('select');if(!el)return JSON.stringify({ok:false,labels:labels.map(x=>(x.innerText||'').trim())});const option=[...el.options].find(o=>(o.textContent||'').toLowerCase().includes(${JSON.stringify(optionText.toLowerCase())}));if(!option)return JSON.stringify({ok:false,options:[...el.options].map(o=>o.textContent)});el.value=option.value;el.dispatchEvent(new Event('change',{bubbles:true}));return JSON.stringify({ok:true,value:el.value,text:option.textContent});})()`);
  const result = JSON.parse(raw);
  if (!result.ok) throw new Error(`SELECT_FIELD ${labelText} -> ${optionText} failed: ${raw}`);
}

async function setByAriaLabel(ws, label, value) {
  const raw = await evalIn(ws, `(()=>{const els=[...document.querySelectorAll('input,textarea,select')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0});const el=els.find(e=>(e.getAttribute('aria-label')||'').toLowerCase().includes(${JSON.stringify(label.toLowerCase())}));if(!el)return JSON.stringify({ok:false,labels:els.map(e=>e.getAttribute('aria-label')).filter(Boolean)});const v=${JSON.stringify(value)};if(el.tagName==='SELECT'){const opt=[...el.options].find(o=>(o.textContent||'').toLowerCase().includes(String(v).toLowerCase()));el.value=opt?opt.value:v;el.dispatchEvent(new Event('change',{bubbles:true}));}else{const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;setter?setter.call(el,v):el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}return JSON.stringify({ok:true,value:el.value});})()`);
  const result = JSON.parse(raw);
  if (!result.ok) throw new Error(`SET_ARIA ${label} failed: ${raw}`);
}

async function setByPlaceholder(ws, placeholder, value) {
  const raw = await evalIn(ws, `(()=>{const els=[...document.querySelectorAll('input,textarea')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0});const el=els.find(e=>(e.placeholder||'').toLowerCase().includes(${JSON.stringify(placeholder.toLowerCase())}));if(!el)return JSON.stringify({ok:false,placeholders:els.map(e=>e.placeholder)});const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;setter?setter.call(el,${JSON.stringify(value)}):el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return JSON.stringify({ok:true,value:el.value});})()`);
  const result = JSON.parse(raw);
  if (!result.ok) throw new Error(`SET_PLACEHOLDER ${placeholder} failed: ${raw}`);
}

async function main() {
  const ws = await connect();
  try {
    const info = await evalIn(ws, `(async()=>JSON.stringify({version:await window.minarvaDesktop?.getVersion?.(),platform:window.minarvaDesktop?.platform}))()`);
    console.log(`APP_INFO ${info}`);
    await ready(ws);
    console.log("RENDERER_READY PASS");

    const before = JSON.parse(await evalIn(ws, `(async()=>{const a=window.minarvaDesktop;return JSON.stringify({device:await a.getDeviceId(),trial:await a.getTrialState()})})()`));
    if (!/^[a-f0-9]{64}$/i.test(before.device)) throw new Error("Device ID is not 64-hex");

    if (before.trial.status === "unactivated") {
      const activation = JSON.parse(await evalIn(ws, `(async()=>JSON.stringify(await window.minarvaDesktop.activateTrial({email:'qa-${Date.now()}@example.com',phone:'9999988888',organizationName:'Minarva Biz Interaction QA',address:'Windows CI Fresh Install'})))()`));
      if (!activation.ok || activation.state?.status !== "active") throw new Error("Trial activation failed");
      await evalIn(ws, `(async()=>{location.reload();return true})()`);
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
    await typeFieldLikeUser(ws, "Add Product", "Product name", "QA POS Product");
    await setField(ws, "Add Product", "Barcode", "QA1001");
    await setField(ws, "Add Product", "Cost price", "60");
    await setField(ws, "Add Product", "Selling price", "100");
    await setField(ws, "Add Product", "Opening stock", "5");
    await setField(ws, "Add Product", "Minimum stock", "1");
    await click(ws, "PRODUCT_SAVE", ["save product"]);
    await assertMain(ws, "PRODUCT_SAVED", ["QA POS Product"]);
    // Product category add button must open/save and immediately appear in the filter.
    await click(ws, "CATEGORY_ADD", ["+ Category"]);
    await typeFieldLikeUser(ws, "Add Product Category", "Category name", "QA Category");
    await click(ws, "CATEGORY_SAVE", ["save category"]);
    await assertMain(ws, "CATEGORY_SAVED", ["QA Category"]);

    // WMS: create a real warehouse + receiving bin so the later GRN can
    // post physical stock into a concrete location in the installed app.
    await click(ws, "WAREHOUSE", ["warehouse / wms"]);
    await assertMain(ws, "WAREHOUSE", ["Warehouse Management", "Create warehouse", "Transfer workflow"]);
    await setMainField(ws, "Name", "QA Warehouse");
    await setMainField(ws, "Code", "QAWH");
    await click(ws, "CREATE_WAREHOUSE", ["create warehouse"]);
    await assertMain(ws, "WAREHOUSE_CREATED", ["QA Warehouse"]);
    await selectFieldByText(ws, "Warehouse", "QA Warehouse");
    await setByPlaceholder(ws, "A-01", "RCV-01");
    await setByPlaceholder(ws, "Rack A / Bin 01", "QA Receiving Bin");
    await selectFieldByText(ws, "Type", "Receiving");
    await click(ws, "CREATE_LOCATION", ["create location"]);
    await assertMain(ws, "WAREHOUSE_LOCATION_CREATED", ["Location created", "Locations", "1", "RCV-01"]);

    // Opening bank is an explicit one-time cutover action and must be recorded before normal bank activity.
    await click(ws, "OPENING_BANK_ACCOUNTING", ["accounting"]);
    await assertMain(ws, "OPENING_BANK_CARD", ["Accounting & General Ledger", "Opening bank balance"]);
    await setMainField(ws, "Opening bank balance", "500");
    await click(ws, "POST_OPENING_BANK", ["post opening bank"]);
    await assertMain(ws, "OPENING_BANK_POSTED", ["Opening bank balance posted."]);
    await click(ws, "OPENING_BANK_TRIAL", ["trial balance"]);
    await assertMain(ws, "OPENING_BANK_TRIAL", ["Trial Balance", "Bank", "₹500.00"]);

    // POS: select customer, add product card, complete a credit sale.
    await click(ws, "SALES", ["sales & billing"]);
    await assertMain(ws, "POS", ["POS Billing", "Current Sale", "QA POS Product"]);
    await selectFieldByText(ws, "Walk-in customer", "QA POS Customer").catch(async () => {
      const raw = await evalIn(ws, `(()=>{const main=document.querySelector('[data-testid="app-content"]');const el=[...main.querySelectorAll('select')].find(s=>[...s.options].some(o=>(o.textContent||'').includes('QA POS Customer')));if(!el)return JSON.stringify({ok:false});const opt=[...el.options].find(o=>(o.textContent||'').includes('QA POS Customer'));el.value=opt.value;el.dispatchEvent(new Event('change',{bubbles:true}));return JSON.stringify({ok:true});})()`);
      if (!JSON.parse(raw).ok) throw new Error("POS customer select failed");
    });
    await click(ws, "POS_PRODUCT", ["QA POS Product"]);
    await click(ws, "HOLD_SALE", ["hold sale"]);
    await assertMain(ws, "SALE_HELD", ["Held sales (1)", "Sale held"]);
    const heldSelect = await evalIn(ws, `(()=>{const s=[...document.querySelectorAll('select')].find(x=>(x.getAttribute('aria-label')||'').includes('Held sales'));if(!s||s.options.length<2)return JSON.stringify({ok:false,options:s?[...s.options].map(o=>o.textContent):[]});s.value=s.options[1].value;s.dispatchEvent(new Event('change',{bubbles:true}));return JSON.stringify({ok:true,value:s.value});})()`);
    if (!JSON.parse(heldSelect).ok) throw new Error(`Held-sale selection failed: ${heldSelect}`);
    await click(ws, "RESUME_SALE", ["resume sale"]);
    await assertMain(ws, "SALE_RESUMED", ["Resumed HOLD-", "QA POS Product"]);
    await setByAriaLabel(ws, "Payment amount 1", "5");
    await click(ws, "ADD_SPLIT_PAYMENT", ["+ payment"]);
    await setByAriaLabel(ws, "Payment method 2", "Card");
    await setByAriaLabel(ws, "Payment amount 2", "5");
    const cartState = JSON.parse(await evalIn(ws, `JSON.stringify({main:(document.querySelector('[data-testid="app-content"]')?.innerText||''),complete:[...document.querySelectorAll('button')].find(b=>(b.innerText||'').includes('Complete Sale'))?.disabled})`));
    if (cartState.complete) throw new Error("Complete Sale remained disabled after resuming held sale");
    await click(ws, "COMPLETE_SALE", ["complete sale"]);
    await assertMain(ws, "SALE_COMPLETED", ["Sale completed"]);
    await click(ws, "SALES_HISTORY", ["history"]);
    await assertMain(ws, "SALES_HISTORY", ["Sales", "QA POS Customer"]);

    // Service order creation must work from the desktop UI.
    await click(ws, "SERVICES", ["services & orders"]);
    await assertMain(ws, "SERVICES", ["Services & Orders", "New Order"]);
    await click(ws, "NEW_ORDER", ["new order"]);
    await selectDialogFieldByText(ws, "New Service Order", "Customer", "QA POS Customer");
    await setField(ws, "New Service Order", "Price", "250");
    await setField(ws, "New Service Order", "Advance", "50");
    await selectDialogFieldByText(ws, "New Service Order", "Advance payment method", "UPI");
    await click(ws, "CREATE_ORDER", ["create order"]);
    await assertMain(ws, "ORDER_CREATED", ["QA POS Customer", "₹250.00"]);
    await assertMain(ws, "SERVICE_REFUND_CANCEL_AVAILABLE", ["Refund ₹50.00 & Cancel", "Cash refund"]);
    await setByAriaLabel(ws, "Order expense category", "Other");
    await setByAriaLabel(ws, "Order expense payment method", "UPI");
    await setByAriaLabel(ws, "Order expense description", "QA order expense");
    await setByAriaLabel(ws, "Order expense amount", "25");
    await click(ws, "ORDER_EXPENSE", ["record expense"]);
    await assertMain(ws, "ORDER_EXPENSE_SAVED", ["QA order expense", "₹25.00"]);

    // Exercise the explicit paid-order refund cancellation from the installed Windows UI.
    await click(ws, "REFUND_ORDER_NEW", ["new order"]);
    await selectDialogFieldByText(ws, "New Service Order", "Customer", "QA POS Customer");
    await setField(ws, "New Service Order", "Price", "120");
    await setField(ws, "New Service Order", "Advance", "30");
    await selectDialogFieldByText(ws, "New Service Order", "Advance payment method", "Bank");
    await click(ws, "REFUND_ORDER_CREATE", ["create order"]);
    await assertMain(ws, "REFUND_CANCEL_AVAILABLE", ["Refund ₹30.00 & Cancel", "Cash refund"]);
    await setByAriaLabel(ws, "Service order refund payment method", "Bank");
    await click(ws, "REFUND_CANCEL_SERVICE", ["refund ₹30.00 & cancel"]);
    const refundCancelState = JSON.parse(await evalIn(ws, `JSON.stringify({button:[...document.querySelectorAll('button')].some(b=>(b.innerText||'').includes('Refund ₹30.00 & Cancel')),main:(document.querySelector('[data-testid="app-content"]')?.innerText||'').slice(0,5000)})`));
    if (refundCancelState.button) throw new Error("Service-order refund cancel action remained available after cancellation");
    await click(ws, "REFUND_VERIFY_PAYMENTS", ["payments"]);
    await assertMain(ws, "REFUND_PAYMENT_SOURCE", ["Service order cancellation refund", "₹30.00", "bank"]);


    // Payment collection against the unpaid sale.
    await click(ws, "PAYMENTS", ["payments"]);
    await assertMain(ws, "PAYMENTS", ["Payments", "QA POS Customer", "90"]);
    await click(ws, "COLLECT_PAYMENT", ["collect"]);
    await setField(ws, "Collect payment", "Amount", "90");
    await click(ws, "RECORD_PAYMENT", ["record payment"]);
    await assertMain(ws, "PAYMENT_RECORDED", ["Payments", "QA POS Customer", "₹200.00"]);

    await click(ws, "SETTLED_SALES", ["sales & billing"]);
    await click(ws, "SETTLED_HISTORY", ["history"]);
    await assertMain(ws, "SETTLED_INVOICE", ["QA POS Customer", "completed"]);
    await assertSettledInvoice(ws, "QA POS Customer");

    await click(ws, "SALE_ACCOUNTING", ["accounting"]);
    await click(ws, "SALE_STATEMENT", ["financial statements"]);
    await assertMain(ws, "SALE_POSTED", ["Product Sales", "Cost of Goods Sold", "Balance sheet balanced"]);
    await assertStatementProfit(ws, 265);

    // Return/refund with stock restock.
    await click(ws, "RETURNS", ["returns & refunds"]);
    await assertMain(ws, "RETURNS", ["New Return", "New Exchange"]);
    await click(ws, "NEW_RETURN", ["new return"]);
    const returnSelect = await evalIn(ws, `(()=>{const d=[...document.querySelectorAll('[role="dialog"]')].find(x=>(x.getAttribute('aria-label')||'').includes('Process return'));const s=d?.querySelector('select');if(!s||s.options.length<2)return JSON.stringify({ok:false,options:s?[...s.options].map(o=>o.textContent):[]});s.value=s.options[1].value;s.dispatchEvent(new Event('change',{bubbles:true}));return JSON.stringify({ok:true});})()`);
    if (!JSON.parse(returnSelect).ok) throw new Error(`Return invoice selection failed: ${returnSelect}`);
    await sleep(300);
    const qty = await evalIn(ws, `(()=>{const d=[...document.querySelectorAll('[role="dialog"]')].find(x=>(x.getAttribute('aria-label')||'').includes('Process return'));const i=d?.querySelector('input[type="number"]');if(!i)return JSON.stringify({ok:false});const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;setter.call(i,'1');i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));return JSON.stringify({ok:true});})()`);
    if (!JSON.parse(qty).ok) throw new Error("Return quantity input missing");
    await click(ws, "PROCESS_REFUND", ["process refund"]);
    await assertMain(ws, "RETURN_RECORDED", ["QA POS Customer", "New Return", "New Exchange"]);

    // Discounted return uses the invoice value in both preview and mutation.
    await click(ws, "DISCOUNT_SALES", ["sales & billing"]);
    await click(ws, "DISCOUNT_POS", ["pos billing"]);
    await click(ws, "DISCOUNT_PRODUCT", ["qa pos product"]);
    await setByAriaLabel(ws, "Discount % QA POS Product", "10");
    await setByAriaLabel(ws, "Payment amount 1", "90");
    await click(ws, "DISCOUNT_COMPLETE", ["complete sale"]);
    await assertMain(ws, "DISCOUNT_SALE_DONE", ["Sale completed"]);
    await click(ws, "DISCOUNT_RETURNS", ["returns & refunds"]);
    await click(ws, "DISCOUNT_NEW_RETURN", ["new return"]);
    await selectDialogFieldByText(ws, "Process return", "Original sale", "₹90.00");
    const discountQty = await evalIn(ws, `(()=>{const d=document.querySelector('[role="dialog"]');const i=d?.querySelector('input[type="number"]');if(!i)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'1');i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
    if (!discountQty) throw new Error("Discount return quantity missing");
    await sleep(300);
    const discountPreview = await evalIn(ws, `document.querySelector('[role="dialog"]')?.innerText || ''`);
    if (!/Return value\s*₹90\.00/.test(discountPreview)) throw new Error("Discount return preview mismatch: " + discountPreview);
    await click(ws, "DISCOUNT_REFUND", ["process refund"]);
    await assertMain(ws, "DISCOUNT_REFUND_DONE", ["Return/refund completed", "₹90.00"]);

    // Barcode Add button must add a matching product to the POS cart.
    await click(ws, "SALES_BARCODE", ["sales & billing"]);
    await click(ws, "POS_TAB_BARCODE", ["pos billing"]);
    await assertCart(ws, "BEFORE_BARCODE", true);
    await click(ws, "POS_ADD_CUSTOMER", ["add customer"]);
    await setField(ws, "Add Customer", "Name", "QA Quick Customer");
    await click(ws, "POS_SAVE_CUSTOMER", ["save customer"]);
    await assertMain(ws, "POS_QUICK_CUSTOMER", ["Current Sale", "QA Quick Customer"]);
    await setByPlaceholder(ws, "Scan barcode", "QA1001");
    await click(ws, "ADD_BARCODE", ["add barcode"]);
    await assertMain(ws, "BARCODE_CART", ["QA POS Product", "₹100.00"]);
    await assertCart(ws, "AFTER_BARCODE_ADD", false);
    await click(ws, "CLEAR_CART", ["clear"]);
    await assertCart(ws, "AFTER_CLEAR", true);


    // Expense create: default category must be real, not visually selected-only.
    await click(ws, "EXPENSES", ["expenses"]);
    await assertMain(ws, "EXPENSES", ["Expenses", "Add Expense"]);
    await click(ws, "ADD_EXPENSE", ["add expense"]);
    await setField(ws, "Add Expense", "Amount", "50");
    await setField(ws, "Add Expense", "Description", "QA interaction expense");
    await click(ws, "SAVE_EXPENSE", ["save expense"]);
    await assertMain(ws, "EXPENSE_SAVED", ["2 records", "QA interaction expense"]);
    await clickRowButton(ws, "EXPENSE_REVERSE", "QA interaction expense", "Reverse");
    await assertMain(ws, "EXPENSE_REVERSE_CONFIRM", ["Reversal reason *", "Confirm reversal"]);
    await setField(ws, "Reverse expense", "Reversal reason", "QA correction");
    await clickDialogButton(ws, "EXPENSE_CONFIRM_REVERSE", "Reverse expense", "Confirm reversal");
    await assertMain(ws, "EXPENSE_REVERSED", ["1 records", "QA order expense"]);

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
    await assertPayableLedger(ws, 0);

    // Procurement Step 3A: purchase order is separate from direct purchase and
    // must be explicitly approved before any later receipt/accounting step.
    await assertMain(ws, "PURCHASE_ORDER_PANEL", ["Purchase Order", "Create Purchase Order"]);
    await selectFieldByText(ws, "Purchase order supplier", "QA Supplier");
    await setByAriaLabel(ws, "Purchase order product", "QA POS Product");
    await setByPlaceholder(ws, "Qty", "2");
    await setByPlaceholder(ws, "Unit cost", "60");
    await click(ws, "PO_ADD_LINE", ["add line"]);
    await click(ws, "PO_CREATE", ["create purchase order"]);
    await assertMain(ws, "PO_CREATED", ["PO-", "draft"]);
    await click(ws, "PO_APPROVE", ["approve"]);
    await assertMain(ws, "PO_APPROVED", ["PO-", "approved"]);
    await click(ws, "PO_RECEIVE", ["receive goods"]);
    await setField(ws, "Receive goods", "received quantity", "2");
    await selectDialogFieldByText(ws, "Receive goods", "Receive into warehouse / bin", "RCV-01");
    await click(ws, "POST_GRN", ["post goods receipt"]);
    await assertMain(ws, "GRN_POSTED", ["GRN-", "received"]);

    await click(ws, "CREATE_SUPPLIER_INVOICE", ["create supplier invoice"]);
    await setField(ws, "Supplier invoice", "Supplier invoice number", "QA-AP-001");
    await setField(ws, "Supplier invoice", "invoice quantity", "2");
    await click(ws, "DRAFT_SUPPLIER_INVOICE", ["create draft invoice"]);
    await clickExactInvoiceButton(ws, "Post"); await assertPayableLedger(ws, 120); await clickExactInvoiceButton(ws, "Pay");
    await setField(ws, "Pay supplier invoice", "Amount", "20");
    await click(ws, "PAY_SUPPLIER_INVOICE", ["record payment"]);
    await assertSupplierInvoice(ws, 100, "partially paid"); await assertPayableLedger(ws, 100);
    await clickExactInvoiceButton(ws, "Pay");
    await setField(ws, "Pay supplier invoice", "Amount", "100");
    await click(ws, "FINISH_SUPPLIER_PAYMENT", ["record payment"]);
    await assertSupplierInvoice(ws, 0, "paid"); await assertPayableLedger(ws, 0);

    // Accounting Step 4A: create an account, post a balanced double-entry
    // journal and verify the installed app exposes the Trial Balance.
    await click(ws, "ACCOUNTING", ["accounting"]);
    await assertMain(ws, "ACCOUNTING", ["Accounting & General Ledger", "Chart of Accounts"]);
    await click(ws, "EXPENSE_STATEMENT", ["financial statements"]);
    await assertMain(ws, "EXPENSE_AUTO_POSTED", ["Balance sheet balanced", "Order-specific Expenses"]);
    await assertStatementProfit(ws, 225);
    await click(ws, "ACCOUNTS_TAB", ["chart of accounts"]);
    await setMainField(ws, "Account code", "6100");
    await setMainField(ws, "Account name", "QA Expense");
    await selectFieldByText(ws, "Account type", "Expense");
    await click(ws, "CREATE_ACCOUNT", ["create account"]);
    await assertMain(ws, "ACCOUNT_CREATED", ["6100", "QA Expense"]);
    await click(ws, "JOURNAL_TAB", ["journal entries"]);
    await assertMain(ws, "JOURNAL_FORM", ["New manual journal", "Save Draft Journal"]);
    await setMainField(ws, "Description", "QA balanced journal");
    await setByAriaLabel(ws, "Journal account 1", "QA Expense");
    await setByAriaLabel(ws, "Journal debit 1", "100");
    await setByAriaLabel(ws, "Journal account 2", "Cash");
    await setByAriaLabel(ws, "Journal credit 2", "100");
    await setByAriaLabel(ws, "Journal debit 1", "-100");
    await click(ws, "REJECT_NEGATIVE_JOURNAL", ["save draft journal"]);
    await assertMain(ws, "INVALID_JOURNAL_REJECTED", ["Journal amounts must be finite, non-negative"]);
    await setByAriaLabel(ws, "Journal debit 1", "100");
    await click(ws, "SAVE_JOURNAL", ["save draft journal"]);
    await assertMain(ws, "JOURNAL_DRAFT", ["JV-", "draft", "QA balanced journal"]);
    await click(ws, "POST_JOURNAL", ["post"]);
    await assertMain(ws, "JOURNAL_POSTED", ["posted", "QA balanced journal"]);
    await click(ws, "TRIAL_BALANCE", ["trial balance"]);
    await assertMain(ws, "TRIAL_BALANCE", ["Trial Balance", "QA Expense", "Cash"]);

    await click(ws, "FINANCIAL_STATEMENTS", ["financial statements"]);
    await assertMain(ws, "FINANCIAL_STATEMENTS", ["Profit & Loss", "Balance Sheet", "QA Expense", "Balance sheet balanced"]);
    await assertStatementProfit(ws, 125);

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
    const laundryDialog = JSON.parse(await evalIn(ws, `JSON.stringify([...document.querySelectorAll('[role="dialog"]')].map(x=>x.getAttribute('aria-label')))`));
    if (!laundryDialog.some((x) => /outsourced laundry/i.test(x || ""))) throw new Error("Outsourced laundry modal did not open");
    await click(ws, "CANCEL_LAUNDRY", ["cancel"]);
    // Re-open and actually save an outsourced laundry ticket.
    await click(ws, "ADD_LAUNDRY_SAVE", ["outsourced laundry"]);
    await selectDialogFieldByText(ws, "Outsourced Laundry", "Customer", "QA POS Customer");
    await setField(ws, "Outsourced Laundry", "Garment", "QA Shirt");
    await selectDialogFieldByText(ws, "Outsourced Laundry", "Laundry supplier", "City Laundry Works");
    await setField(ws, "Outsourced Laundry", "Paid now", "50");
    await selectDialogFieldByText(ws, "Outsourced Laundry", "Payment method", "UPI");
    await click(ws, "SAVE_LAUNDRY", ["save"]);
    await assertMain(ws, "LAUNDRY_SAVED", ["1 tickets", "QA POS Customer", "QA Shirt"]);
    await clickButton(ws, "LAUNDRY_MARK_SENT", ["mark sent"]);
    await assertMain(ws, "LAUNDRY_SENT", ["Mark Received"]);
    await clickButton(ws, "LAUNDRY_MARK_RECEIVED", ["mark received"]);
    await assertMain(ws, "LAUNDRY_RECEIVED", ["Mark Delivered"]);
    await clickButton(ws, "LAUNDRY_MARK_DELIVERED", ["mark delivered"]);
    await assertMain(ws, "LAUNDRY_DELIVERED", ["delivered"]);
    await click(ws, "LAUNDRY_VERIFY_PAYMENT", ["payments"]);
    await assertMain(ws, "LAUNDRY_PAYMENT_SOURCE", ["Laundry receipt:", "laundry", "upi", "₹50.00"]);
    await click(ws, "LAUNDRY_COLLECT", ["collect"]);
    await setField(ws, "Collect payment", "Amount", "300");
    await selectDialogFieldByText(ws, "Collect payment", "Method", "UPI");
    await click(ws, "LAUNDRY_RECORD_COLLECTION", ["record payment"]);
    await assertMain(ws, "LAUNDRY_COLLECTION_ALLOCATED", ["Service orders:", "Laundry:", "100.00"]);
    await click(ws, "LAUNDRY_CANCEL_RETURN", ["laundry & ironing"]);
    await assertMain(ws, "LAUNDRY_CANCEL_LIST", ["Laundry & Ironing", "QA Shirt"]);
    await clickButton(ws, "LAUNDRY_CANCEL_OPEN", ["cancel ticket"]);
    await assertMain(ws, "LAUNDRY_CANCEL_PAID_TO_DATE", ["₹150.00"]);
    await selectDialogFieldByText(ws, "Cancel laundry ticket", "Laundry refund payment method", "UPI");
    await selectDialogFieldByText(ws, "Cancel laundry ticket", "Supplier cost handling", "Reverse supplier payable / cost");
    await clickDialogButton(ws, "LAUNDRY_CANCEL_CONFIRM", "Cancel laundry ticket", "Cancel Ticket");
    await assertMain(ws, "LAUNDRY_CANCELLED", ["cancelled"]);
    await click(ws, "LAUNDRY_REFUND_VERIFY", ["payments"]);
    await assertMain(ws, "LAUNDRY_REFUND_SOURCE", ["Laundry cancellation refund:", "refund", "upi", "₹150.00"]);


    // Day-end action: content assertion is scoped to main, not sidebar.
    await click(ws, "DAY_END", ["day-end close"]);
    await assertMain(ws, "DAY_END", ["Day-end close", "Close today"]);
    await click(ws, "CLOSE_TODAY", ["close today"]);
    await assertMain(ws, "DAY_END_CLOSED", ["Day-end close", "Net"]);

    // Notifications and report callbacks.
    await click(ws, "NOTIFICATIONS", ["messages & notifications", "notifications"]);
    await assertMain(ws, "NOTIFICATIONS", ["Notifications"]);
    const mark = JSON.parse(await evalIn(ws, `(async()=>{const main=document.querySelector('[data-testid="app-content"]');const el=[...main.querySelectorAll('button')].find(e=>/mark all read/i.test(e.innerText||''));if(!el)return JSON.stringify({found:false});el.click();await new Promise(r=>setTimeout(r,400));return JSON.stringify({found:true})})()`));
    if (!mark.found) throw new Error("Notifications mark-all-read callback missing");

    await click(ws, "REPORTS", ["reports & analytics"]);
    await assertMain(ws, "REPORTS", ["Reports & Analytics", "Refresh"]);
    await click(ws, "REPORT_REFRESH", ["refresh"]);

    // Settings save and theme buttons must mutate state and survive navigation.
    await click(ws, "SETTINGS", ["settings"]);
    await assertMain(ws, "SETTINGS", ["Business Settings", "Save business profile", "Save tax settings"]);
    await setMainField(ws, "Business / trade name", "QA Minarva Shop");
    await click(ws, "SAVE_PROFILE", ["save business profile"]);
    await click(ws, "THEME_OCEAN", ["ocean"]);
    const theme = JSON.parse(await evalIn(ws, `JSON.stringify(document.documentElement.dataset.theme||'')`));
    if (theme !== "ocean") throw new Error(`Theme button failed; expected ocean, got ${theme}`);
    await click(ws, "DASHBOARD_AFTER_SETTINGS", ["dashboard"]);
    await click(ws, "SETTINGS_REOPEN", ["settings"]);
    await assertMainFieldValue(ws, "Business / trade name", "QA Minarva Shop");

  await verifyPrintTemplates(expression => evalIn(ws, expression));

    // Automatic backup is a non-dialog desktop action and must create a verifiable file.
    await click(ws, "BACKUP", ["backup & restore"]);
    await assertMain(ws, "BACKUP", ["Backup & Restore", "Run automatic backup", "Create backup"]);
    await click(ws, "RUN_AUTO_BACKUP", ["run automatic backup"], 1200);
    await assertMain(ws, "AUTO_BACKUP_CREATED", ["Automatic backup created", "verified SQLite"]);


    // Command/global search opens and routes.
    await click(ws, "COMMAND_PALETTE", ["open command palette", "quick commands"]);
    const dialogs = JSON.parse(await evalIn(ws, `JSON.stringify([...document.querySelectorAll('[role="dialog"]')].map(x=>x.getAttribute('aria-label')))`));
    if (!dialogs.some((x) => /command palette/i.test(x || ""))) throw new Error("Command palette did not open");
    await evalIn(ws, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true`);

    console.log("WINDOWS_INTERACTION_AUDIT PASS");
  } finally {
    ws.close();
  }
}

main().catch((e) => {
  console.error(`WINDOWS_INTERACTION_AUDIT FAIL: ${e instanceof Error ? e.stack || e.message : String(e)}`);
  process.exit(1);
});

async function assertStatementProfit(ws, expected) {
  const actual = await evalIn(ws, `Number((document.querySelector('[data-testid="statement-net-profit"]')?.textContent || 'NaN').replace(/[^0-9.\\-]/g, ''))`);
  if (actual !== expected) throw new Error(`Financial statement profit mismatch: expected ${expected}, received ${actual}`);
  console.log('FINANCIAL_STATEMENT_AMOUNT PASS');
}

async function assertSettledInvoice(ws, customerName) {
  const row = await evalIn(ws, `(()=>{const row=[...document.querySelectorAll('tbody tr')].find(r=>(r.innerText||'').includes(${JSON.stringify(customerName)}));return row ? [...row.querySelectorAll('td')].map(c=>(c.innerText||'').trim()) : null;})()`);
  const money = (value) => Number(String(value).replace(/[^0-9.\-]/g,''));
  if (!row || money(row[2]) !== 100 || money(row[3]) !== 100 || money(row[4]) !== 0 || row[5] !== 'completed') throw new Error('Invoice settlement mismatch: '+JSON.stringify(row));
  console.log('CUSTOMER_COLLECTION_INVOICE_SETTLED PASS');
}

async function clickExactInvoiceButton(ws, label) {
  const clicked = await evalIn(ws, `(()=>{const b=[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim()===${JSON.stringify(label)}&&!b.disabled);if(!b)return false;b.click();return true;})()`);
  if(!clicked) throw new Error('Invoice button missing: '+label); await sleep(500);
}
async function assertSupplierInvoice(ws, balance, status) {
  const text = await evalIn(ws, `(()=>{const rows=[...document.querySelectorAll('div')].map(e=>e.innerText||'').filter(t=>t.includes('Supplier ref QA-AP-001')&&t.includes('balance'));return rows.sort((a,b)=>a.length-b.length)[0]||'';})()`);
  if(!text.includes(status)||!text.includes('balance ₹'+balance.toFixed(2))) throw new Error('Supplier invoice settlement mismatch: '+text);
  console.log('SUPPLIER_INVOICE_SETTLED '+balance+' PASS');
}

async function assertPayableLedger(ws, expected) {
  await click(ws,'AP_ACCOUNTING',['accounting']); await click(ws,'AP_TRIAL',['trial balance']);
  const row = await evalIn(ws, `(()=>{const r=[...document.querySelectorAll('tbody tr')].find(r=>r.querySelectorAll('td')[1]?.innerText.trim()==='Accounts Payable');return r?[...r.querySelectorAll('td')].map(c=>c.innerText):null;})()`);
  const credit = row ? Number(row[4].replace(/[^0-9.-]/g,'')) : 0;
  if(credit!==expected || (row && Number(row[3].replace(/[^0-9.-]/g,''))!==0)) throw new Error('AP ledger mismatch: '+JSON.stringify(row));
  const purchaseRow = await evalIn(ws, `(()=>{const r=[...document.querySelectorAll('tbody tr')].find(r=>r.querySelectorAll('td')[1]?.innerText.trim()==='Unclassified Purchases');return r?[...r.querySelectorAll('td')].map(c=>c.innerText):null;})()`);
  if(!purchaseRow || Number(purchaseRow[3].replace(/[^0-9.-]/g,''))!==500 || Number(purchaseRow[4].replace(/[^0-9.-]/g,''))!==0) throw new Error('Direct purchase asset ledger mismatch: '+JSON.stringify(purchaseRow));
  console.log('DIRECT_PURCHASE_LEDGER 500 PASS');
  console.log('AP_LEDGER '+expected+' PASS'); await click(ws,'AP_PURCHASES',['purchases']);
}
