const base = 'http://127.0.0.1:9222';

async function sleep(ms) { await new Promise((resolve) => setTimeout(resolve, ms)); }
async function httpJson(path) {
  const response = await fetch(`${base}${path}`);
  if (!response.ok) throw new Error(`CDP HTTP ${response.status} for ${path}`);
  return response.json();
}
async function cdpEval(ws, expression) {
  const id = ++cdpEval.nextId;
  const resultPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`CDP evaluate timeout: ${expression.slice(0, 120)}`)), 15000);
    cdpEval.pending.set(id, { resolve, reject, timer });
  });
  ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
  return resultPromise;
}
cdpEval.nextId = 0;
cdpEval.pending = new Map();

async function main() {
  let target;
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      const pages = await httpJson('/json/list');
      target = pages.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
      if (target) break;
    } catch {}
    await sleep(1000);
  }
  if (!target) throw new Error('Electron renderer CDP target was not found.');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = cdpEval.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      cdpEval.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || 'CDP error'));
      else pending.resolve(message.result?.result?.value);
    } catch (error) {
      for (const pending of cdpEval.pending.values()) pending.reject(error);
      cdpEval.pending.clear();
    }
  });

  const info = await cdpEval(ws, `(async()=>JSON.stringify({version:await window.minarvaDesktop?.getVersion?.(), platform:window.minarvaDesktop?.platform, body:document.body?.innerText?.slice(0,1200)||''}))()`);
  console.log(`APP_INFO ${info}`);

  async function waitForRendererReady() {
    for (let attempt = 1; attempt <= 60; attempt++) {
      const state = await cdpEval(ws, `JSON.stringify({ready:document.documentElement.dataset.minarvaRendererReady==='true',error:document.documentElement.dataset.minarvaRendererError==='true',text:(document.body?.innerText||'').slice(0,1200)})`);
      const parsed = JSON.parse(state);
      if (parsed.error) throw new Error(`Renderer reported fatal startup error: ${parsed.text}`);
      if (parsed.ready || /(dashboard|customers|products|sales|reports|starting trial|trial)/i.test(parsed.text)) return;
      await sleep(500);
    }
    throw new Error('Installed renderer did not become ready within 30 seconds.');
  }
  await waitForRendererReady();
  console.log('RENDERER_READY PASS');

  const securityBoundary = await cdpEval(ws, `(async()=>{
    const csp=document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')||'';
    const remoteImage=await new Promise((resolve)=>{
      const image=new Image();
      let settled=false;
      const finish=(value)=>{if(settled)return;settled=true;resolve(value);};
      image.onload=()=>finish('allowed');
      image.onerror=()=>finish('blocked');
      image.src='https://example.com/favicon.ico?minarva-session-probe='+Date.now();
      setTimeout(()=>finish('timeout'),3000);
    });
    const popup=window.open('https://example.com/minarva-popup-probe','_blank');
    await new Promise((resolve)=>setTimeout(resolve,100));
    const popupOpened=Boolean(popup&&!popup.closed);
    try{popup?.close();}catch{}
    return JSON.stringify({csp,remoteImage,popupOpened});
  })()`);
  console.log(`SECURITY_BOUNDARY ${securityBoundary}`);
  const security = JSON.parse(securityBoundary);
  if (!security.csp.includes("default-src 'self'") || !security.csp.includes("object-src 'none'") || !security.csp.includes("frame-src 'none'")) {
    throw new Error('Desktop CSP is missing required deny directives.');
  }
  if (security.remoteImage !== 'blocked') throw new Error(`Remote image was not blocked: ${security.remoteImage}`);
  if (security.popupOpened) throw new Error('Remote popup was not denied.');
  console.log('SECURITY_BOUNDARY PASS');

  const desktopApi = await cdpEval(ws, `(async()=>{const api=window.minarvaDesktop; if(!api) throw new Error('minarvaDesktop bridge missing'); const device=await api.getDeviceId?.(); const trial=await api.getTrialState(); return JSON.stringify({device,trial})})()`);
  console.log(`DEVICE_TRIAL_BEFORE ${desktopApi}`);
  const before = JSON.parse(desktopApi);
  if (!/^[a-f0-9]{64}$/i.test(String(before.device || ''))) throw new Error('Device ID was not a 64-hex hash.');
  if (before.trial?.status !== 'unactivated') throw new Error(`Fresh trial state was not unactivated: ${before.trial?.status}`);

  const activation = await cdpEval(ws, `(async()=>{const api=window.minarvaDesktop; const result=await api.activateTrial({email:'qa-${Date.now()}@example.com',phone:'9999999999',organizationName:'Minarva Biz Fresh Install QA',address:'Windows CI Fresh Install'}); return JSON.stringify(result)})()`);
  console.log(`TRIAL_ACTIVATION ${activation}`);
  const activated = JSON.parse(activation);
  if (!activated?.ok) throw new Error(`Fresh-install trial activation failed: ${activated?.error || 'unknown error'}`);
  if (activated.state?.status !== 'active') throw new Error(`Fresh-install trial did not become active: ${activated.state?.status}`);
  if (!(Number(activated.state?.daysRemaining) >= 29)) throw new Error(`Fresh-install trial daysRemaining unexpected: ${activated.state?.daysRemaining}`);

  await cdpEval(ws, `(async()=>{location.reload(); return 'reloading'})()`);
  await sleep(1200);
  await waitForRendererReady();
  console.log('POST_TRIAL_RENDERER_READY PASS');

  const after = await cdpEval(ws, `(async()=>JSON.stringify(await window.minarvaDesktop.getTrialState()))()`);
  console.log(`TRIAL_AFTER ${after}`);
  const afterState = JSON.parse(after);
  if (afterState.status !== 'active') throw new Error('Trial state could not be read back after secure-storage write.');

  const controls = await cdpEval(ws, `JSON.stringify([...document.querySelectorAll('button,a,[role="button"]')].map((el,i)=>({i,text:(el.innerText||el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,120),aria:el.getAttribute('aria-label')||''})).filter(x=>x.text||x.aria).slice(0,260))`);
  console.log(`CONTROLS ${controls}`);

  async function clickTarget(name, patterns) {
    const result = await cdpEval(ws, `(async()=>{
      const pats=${JSON.stringify(patterns)};
      const visible=(el)=>{const r=el.getBoundingClientRect();const s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!el.disabled};
      const label=(el)=>((el.innerText||el.textContent||'')+' '+(el.getAttribute('aria-label')||'')).replace(/\\s+/g,' ').trim();
      const score=(el)=>{const s=label(el).toLowerCase();return pats.some(p=>s.includes(String(p).toLowerCase()))};
      const find=()=>[...document.querySelectorAll('button,a,[role="button"]')].find(e=>visible(e)&&score(e));
      let el=find();
      if(!el){
        const groups=[...document.querySelectorAll('aside button[aria-expanded]')].filter(visible).map(label);
        for(const groupLabel of groups){
          const group=[...document.querySelectorAll('aside button[aria-expanded]')].find(e=>visible(e)&&label(e)===groupLabel);
          if(group&&group.getAttribute('aria-expanded')!=='true'){group.click();await new Promise(r=>setTimeout(r,100));}
          el=find();
          if(el)break;
        }
      }
      if(!el){const els=[...document.querySelectorAll('button,a,[role="button"]')];return JSON.stringify({ok:false,available:els.filter(visible).map(label).filter(Boolean).slice(0,140)});}
      el.click();
      await new Promise(r=>setTimeout(r,900));
      return JSON.stringify({ok:true,text:label(el),body:(document.body?.innerText||'').slice(0,3200)});
    })()`);
    console.log(`CLICK_${name} ${result}`);
    const parsed = JSON.parse(result);
    if (!parsed.ok) throw new Error(`Could not find clickable target for ${name}. Available=${JSON.stringify(parsed.available || [])}`);
    return parsed;
  }

  async function assertBody(name, patterns) {
    const body = await cdpEval(ws, `JSON.stringify((document.body?.innerText||'').slice(0,10000))`);
    const text = JSON.parse(body).toLowerCase();
    if (!patterns.some((p) => text.includes(String(p).toLowerCase()))) {
      throw new Error(`${name} view marker not found. Patterns=${patterns.join(', ')}`);
    }
    console.log(`VIEW_${name} PASS`);
  }

  const targets = [
    ['DAY_END_CLOSE',['day-end','day end','close day']],
    ['PAYMENTS',['payments']],
    ['RETURNS',['returns & refunds','returns','return']],
    ['SUPPLIERS',['suppliers']],
    ['AUDIT_LOG',['audit log']],
  ];

  for (const [name, patterns] of targets) {
    await clickTarget(name, patterns);
    await assertBody(name, patterns);
  }

  await clickTarget('STAFF_MANAGEMENT',['staff management']);
  await assertBody('STAFF_MANAGEMENT',['staff management']);

  await clickTarget('CUSTOMERS',['customers']);
  await assertBody('CUSTOMERS',['customers']);

  const addCustomer = await clickTarget('CUSTOMER_ADD',['add customer']);
  await assertBody('CUSTOMER_ADD',['add customer']);

  const formInfo = await cdpEval(ws, `JSON.stringify({inputs:[...document.querySelectorAll('input,textarea')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0}).map(e=>({tag:e.tagName,placeholder:e.placeholder||'',name:e.name||'',aria:e.getAttribute('aria-label')||'',value:e.value||''})),buttons:[...document.querySelectorAll('button')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0}).map(e=>(e.innerText||e.textContent||'').replace(/\\s+/g,' ').trim()).filter(Boolean).slice(-30)})`);
  console.log(`CUSTOMER_FORM ${formInfo}`);
  const fillResult = await cdpEval(ws, `(async()=>{
    const fields=[...document.querySelectorAll('input,textarea')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0});
    const set=(el,val)=>{const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;if(setter) setter.call(el,val); else el.value=val;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};
    const match=(el,re)=>re.test(((el.placeholder||'')+' '+(el.name||'')+' '+(el.getAttribute('aria-label')||'')).toLowerCase());
    let used=0;
    for(const el of fields){
      if(match(el,/name|customer/)){set(el,'QA Customer');used++;}
      else if(match(el,/phone|mobile|contact/)){set(el,'9999900001');used++;}
      else if(match(el,/email/)){set(el,`qa-customer-${Date.now()}@example.com`);used++;}
      else if(used===0 && !el.value){set(el,'QA Customer');used++;}
    }
    return JSON.stringify({used,values:fields.map(e=>e.value)});
  })()`);
  console.log(`CUSTOMER_FORM_FILLED ${fillResult}`);
  await clickTarget('CUSTOMER_SAVE',['save customer','save','create customer']);
  await assertBody('CUSTOMER_SAVED',['qa customer','customers']);

  const drill = await cdpEval(ws, `(async()=>{
    const els=[...document.querySelectorAll('button,a,[role="button"],tr')];
    const visible=(el)=>{const r=el.getBoundingClientRect();const s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none};
    const candidates=els.filter(e=>visible(e)&&((e.innerText||e.textContent||'').trim().length>0));
    const el=candidates.find(e=>/(view|details|open)/i.test((e.innerText||e.textContent||'')) && !/customers/i.test((e.innerText||e.textContent||''))) || candidates.find(e=>e.tagName==='TR' && /qa customer/i.test(e.innerText||''));
    if(el){el.click();await new Promise(r=>setTimeout(r,1000));}
    return JSON.stringify({clicked:Boolean(el),body:(document.body?.innerText||'').slice(0,3600)});
  })()`);
  console.log(`CUSTOMER_DRILL ${drill}`);
  const drillParsed=JSON.parse(drill);
  if (!drillParsed.clicked) throw new Error('Customer drill-down target could not be clicked on installed app.');
  if (!/(customer|profile|details)/i.test(drillParsed.body)) throw new Error('Customer drill-down did not produce a customer/profile/details view marker.');
  console.log('VIEW_CUSTOMER_DRILL PASS');

  await clickTarget('GLOBAL_SEARCH',['open command palette','quick commands','command palette']);
  const searchState = await cdpEval(ws, `JSON.stringify({dialogs:document.querySelectorAll('[role="dialog"]').length,inputs:[...document.querySelectorAll('input')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0}).map(e=>e.placeholder||e.getAttribute('aria-label')||'').slice(0,20),body:(document.body?.innerText||'').slice(0,3200)})`);
  console.log(`GLOBAL_SEARCH_STATE ${searchState}`);
  const searchParsed=JSON.parse(searchState);
  if (!(searchParsed.dialogs>0 || searchParsed.inputs.length>0 || /command palette|quick commands/i.test(searchParsed.body))) throw new Error('Global Search did not open an interactive search surface.');
  console.log('VIEW_GLOBAL_SEARCH PASS');

  await clickTarget('NOTIFICATIONS',['notifications']);
  const notificationBody = await cdpEval(ws, `JSON.stringify((document.body?.innerText||'').slice(0,4200))`);
  console.log(`NOTIFICATIONS_OPEN ${notificationBody}`);
  const ntext = JSON.parse(notificationBody).toLowerCase();
  if (!/notification/.test(ntext)) throw new Error('Notifications surface did not open.');
  const mark = await cdpEval(ws, `(async()=>{const els=[...document.querySelectorAll('button,[role="button"]')];const el=els.find(e=>/mark all read|mark all as read/i.test(((e.innerText||e.textContent||'')+' '+(e.getAttribute('aria-label')||''))));if(!el)return JSON.stringify({found:false});el.click();await new Promise(r=>setTimeout(r,800));return JSON.stringify({found:true,body:(document.body?.innerText||'').slice(0,3800)});})()`);
  console.log(`NOTIFICATIONS_MARK_ALL ${mark}`);
  if (!JSON.parse(mark).found) throw new Error('Notifications mark-all-read control was not clickable.');
  console.log('NOTIFICATIONS_MARK_ALL PASS');

  await clickTarget('REPORTS',['reports & analytics']);
  await assertBody('REPORTS',['reports & analytics']);
  const refresh = await cdpEval(ws, `(async()=>{const els=[...document.querySelectorAll('button,[role="button"]')];const el=els.find(e=>/refresh/i.test(((e.innerText||e.textContent||'')+' '+(e.getAttribute('aria-label')||''))));if(!el)return JSON.stringify({found:false});el.click();await new Promise(r=>setTimeout(r,700));return JSON.stringify({found:true,body:(document.body?.innerText||'').slice(0,3800)});})()`);
  console.log(`REPORTS_REFRESH ${refresh}`);
  if (!JSON.parse(refresh).found) throw new Error('Reports refresh control was not clickable.');
  console.log('REPORTS_REFRESH PASS');

  ws.close();
  console.log('WINDOWS_INSTALLED_DEEP_SMOKE PASS');
}

main().catch((error) => { console.error(`WINDOWS_INSTALLED_DEEP_SMOKE FAIL: ${error instanceof Error ? error.stack || error.message : String(error)}`); process.exit(1); });
