const base = 'http://127.0.0.1:9222';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function json(path) { const r = await fetch(`${base}${path}`); if (!r.ok) throw new Error(`CDP HTTP ${r.status}`); return r.json(); }
let nextId = 0;
const pending = new Map();
async function connect() {
  let target;
  for (let i = 0; i < 30; i++) { try { const pages = await json('/json/list'); target = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl); if (target) break; } catch {} await sleep(500); }
  if (!target) throw new Error('Electron renderer CDP target not found');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', (event) => { try { const m = JSON.parse(event.data); const p = pending.get(m.id); if (!p) return; pending.delete(m.id); clearTimeout(p.timer); if (m.error) p.reject(new Error(m.error.message || 'CDP error')); else p.resolve(m.result?.result?.value); } catch {} });
  return ws;
}
async function evalIn(ws, expression) {
  const id = ++nextId;
  return new Promise((resolve, reject) => { const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${expression.slice(0, 100)}`)); }, 15000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } })); });
}
async function ready(ws) {
  for (let i = 0; i < 60; i++) { const raw = await evalIn(ws, `JSON.stringify({ready:document.documentElement.dataset.minarvaRendererReady==='true',error:document.documentElement.dataset.minarvaRendererError==='true',text:(document.body?.innerText||'').slice(0,1400)})`); const s = JSON.parse(raw); if (s.error) throw new Error(`Renderer startup error: ${s.text}`); if (s.ready) return; await sleep(500); }
  throw new Error('Renderer did not become ready');
}
async function click(ws, name, patterns, wait = 900) {
  const raw = await evalIn(ws, `(async()=>{const pats=${JSON.stringify(patterns)};const els=[...document.querySelectorAll('button,a,[role="button"]')];const vis=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const txt=e=>((e.innerText||e.textContent||'')+' '+(e.getAttribute('aria-label')||'')).replace(/\\s+/g,' ').trim();const el=els.find(e=>vis(e)&&pats.some(p=>txt(e).toLowerCase().includes(String(p).toLowerCase())));if(!el)return JSON.stringify({ok:false,available:els.map(txt).filter(Boolean).slice(0,150)});el.click();await new Promise(r=>setTimeout(r,${wait}));return JSON.stringify({ok:true,text:txt(el),body:(document.body?.innerText||'').slice(0,3600)});})()`);
  const out = JSON.parse(raw); console.log(`CLICK_${name} ${raw}`); if (!out.ok) throw new Error(`Target ${name} not found: ${JSON.stringify(out.available)}`); return out;
}
async function assertBody(ws, name, patterns) { const raw = await evalIn(ws, `JSON.stringify((document.body?.innerText||'').slice(0,10000))`); const text = JSON.parse(raw).toLowerCase(); if (!patterns.some((p)=>text.includes(String(p).toLowerCase()))) throw new Error(`${name} marker missing`); console.log(`VIEW_${name} PASS`); }
async function addCustomer(ws, idx) {
  await click(ws, `CUSTOMER_ADD_${idx}`, ['add customer']);
  const fields = await evalIn(ws, `JSON.stringify([...document.querySelectorAll('input,textarea')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0}).map(e=>({placeholder:e.placeholder||'',name:e.name||'',aria:e.getAttribute('aria-label')||'',value:e.value||''})))`);
  console.log(`CUSTOMER_FORM_${idx} ${fields}`);
  const raw = await evalIn(ws, `(async()=>{const fields=[...document.querySelectorAll('input,textarea')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0});const set=(el,v)=>{const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;setter?setter.call(el,v):el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))};const match=(e,re)=>re.test(((e.placeholder||'')+' '+(e.name||'')+' '+(e.getAttribute('aria-label')||'')).toLowerCase());const data={name:'QA Customer ${idx}',phone:'999990000${idx}',email:'qa-customer-${idx}-${Date.now()}@example.com'};for(const e of fields){if(match(e,/name|customer/))set(e,data.name);else if(match(e,/phone|mobile|contact/))set(e,data.phone);else if(match(e,/email/))set(e,data.email);}return JSON.stringify({data,values:fields.map(e=>e.value)})})()`);
  console.log(`CUSTOMER_FILLED_${idx} ${raw}`);
  await click(ws, `CUSTOMER_SAVE_${idx}`, ['save customer','create customer','save']);
  console.log(`CUSTOMER_${idx} SAVED`);
  await sleep(400);
}
async function main(){
  const ws = await connect();
  const info = await evalIn(ws, `(async()=>JSON.stringify({version:await window.minarvaDesktop?.getVersion?.(),platform:window.minarvaDesktop?.platform}))()`); console.log(`APP_INFO ${info}`);
  await ready(ws); console.log('RENDERER_READY PASS');
  const before = JSON.parse(await evalIn(ws, `(async()=>{const a=window.minarvaDesktop;return JSON.stringify({device:await a.getDeviceId(),trialDevice:await a.getTrialDeviceId(),trial:await a.getTrialState()})})()`));
  console.log(`DEVICE_TRIAL_BEFORE ${JSON.stringify(before)}`);
  if(!/^[a-f0-9]{64}$/i.test(before.device)) throw new Error('Device ID is not 64-hex');
  if(before.device!==before.trialDevice) throw new Error('Device/trial device IDs differ');
  if(before.trial.status!=='unactivated') throw new Error(`Fresh trial not unactivated: ${before.trial.status}`);
  const activation=JSON.parse(await evalIn(ws, `(async()=>JSON.stringify(await window.minarvaDesktop.activateTrial({email:'qa-${Date.now()}@example.com',phone:'9999988888',organizationName:'Minarva Biz Populated Dataset QA',address:'Windows CI Fresh Install'})))()`));
  console.log(`TRIAL_ACTIVATION ${JSON.stringify(activation)}`); if(!activation.ok||activation.state?.status!=='active'||activation.state?.daysRemaining<29) throw new Error('Trial activation/safe storage failed');
  await evalIn(ws, `(async()=>{location.reload();return true})()`); await sleep(1200); await ready(ws); console.log('POST_TRIAL_RENDERER_READY PASS');
  const after=JSON.parse(await evalIn(ws, `(async()=>JSON.stringify(await window.minarvaDesktop.getTrialState()))()`)); console.log(`TRIAL_AFTER ${JSON.stringify(after)}`); if(after.status!=='active') throw new Error('Trial state not persisted after reload');

  for (const [name, pats] of [['DAY_END_CLOSE',['day-end','day end','close day']],['PAYMENTS',['payments']],['RETURNS',['returns & refunds','returns']],['SUPPLIERS',['suppliers']],['STAFF_DETAILS',['staff details']],['AUDIT_LOG',['audit log']]]) { await click(ws,name,pats); await assertBody(ws,name,pats); }
  await click(ws,'STAFF_MANAGEMENT',['staff management']); await assertBody(ws,'STAFF_MANAGEMENT',['staff management']);
  await click(ws,'CUSTOMERS',['customers']); await assertBody(ws,'CUSTOMERS',['customers']);
  for (let i=1;i<=3;i++) await addCustomer(ws,i);
  await click(ws,'CUSTOMERS_REFRESH',['customers']);
  const customerState=JSON.parse(await evalIn(ws, `JSON.stringify({body:(document.body?.innerText||''),matches:[...document.querySelectorAll('*')].filter(e=>/QA Customer [123]/i.test(e.innerText||'')).map(e=>(e.innerText||'').trim()).filter(Boolean).slice(0,20)})`));
  const count=[1,2,3].filter(i=>new RegExp('QA Customer '+i,'i').test(customerState.body)).length;
  console.log(`POPULATED_CUSTOMERS count=${count}`); if(count<3) throw new Error(`Expected 3 seeded customers in UI, found ${count}`);
  const drill=JSON.parse(await evalIn(ws, `(async()=>{const els=[...document.querySelectorAll('button,a,[role="button"],tr')];const vis=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const el=els.find(e=>vis(e)&&/QA Customer 1/i.test(e.innerText||e.textContent||''));if(!el)return JSON.stringify({clicked:false});el.click();await new Promise(r=>setTimeout(r,900));return JSON.stringify({clicked:true,body:(document.body?.innerText||'').slice(0,4200)})})()`));
  console.log(`CUSTOMER_DRILL ${JSON.stringify(drill)}`); if(!drill.clicked||!/(customer|profile|details)/i.test(drill.body)) throw new Error('Customer drill-down failed on populated data'); console.log('VIEW_CUSTOMER_DRILL PASS');
  await click(ws,'GLOBAL_SEARCH',['open command palette','quick commands','command palette']); const gs=JSON.parse(await evalIn(ws, `JSON.stringify({dialogs:document.querySelectorAll('[role="dialog"]').length,inputs:[...document.querySelectorAll('input')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0}).length,body:(document.body?.innerText||'').slice(0,3600)})`)); console.log(`GLOBAL_SEARCH_STATE ${JSON.stringify(gs)}`); if(!(gs.dialogs>0||gs.inputs>0||/quick commands|command palette/i.test(gs.body))) throw new Error('Global search/command palette failed'); console.log('VIEW_GLOBAL_SEARCH PASS');
  await click(ws,'NOTIFICATIONS',['notifications']); const n=JSON.parse(await evalIn(ws, `JSON.stringify((document.body?.innerText||'').slice(0,4200))`)); if(!/notification/i.test(n)) throw new Error('Notifications did not open'); console.log('VIEW_NOTIFICATIONS PASS');
  const mark=JSON.parse(await evalIn(ws, `(async()=>{const els=[...document.querySelectorAll('button,[role="button"]')];const txt=e=>((e.innerText||e.textContent||'')+' '+(e.getAttribute('aria-label')||'')).replace(/\\s+/g,' ').trim();const el=els.find(e=>/mark all read|mark all as read/i.test(txt(e)));if(!el)return JSON.stringify({found:false});el.click();await new Promise(r=>setTimeout(r,700));return JSON.stringify({found:true})})()`)); console.log(`NOTIFICATIONS_MARK_ALL ${JSON.stringify(mark)}`); if(!mark.found) throw new Error('Notifications mark-all-read callback missing'); console.log('NOTIFICATIONS_MARK_ALL PASS');
  await click(ws,'REPORTS',['reports & analytics']); await assertBody(ws,'REPORTS',['reports & analytics']);
  const refresh=JSON.parse(await evalIn(ws, `(async()=>{const els=[...document.querySelectorAll('button,[role="button"]')];const txt=e=>((e.innerText||e.textContent||'')+' '+(e.getAttribute('aria-label')||'')).replace(/\\s+/g,' ').trim();const el=els.find(e=>/refresh/i.test(txt(e)));if(!el)return JSON.stringify({found:false});el.click();await new Promise(r=>setTimeout(r,700));return JSON.stringify({found:true})})()`)); console.log(`REPORTS_REFRESH ${JSON.stringify(refresh)}`); if(!refresh.found) throw new Error('Reports refresh callback missing'); console.log('REPORTS_REFRESH PASS');
  ws.close(); console.log('WINDOWS_POPULATED_DEEP_SMOKE PASS');
}
main().catch(e=>{console.error(`WINDOWS_POPULATED_DEEP_SMOKE FAIL: ${e instanceof Error?e.stack||e.message:String(e)}`);process.exit(1)});
