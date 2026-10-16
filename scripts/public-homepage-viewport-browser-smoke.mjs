import assert from "node:assert/strict";

const base = process.env.MINARVA_WEB_BASE || "http://127.0.0.1:3000";
const chrome = process.env.MINARVA_WEB_CDP || "http://127.0.0.1:9223";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function findTab() {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(chrome + "/json/list");
      const pages = await response.json();
      const page = pages.find(p => p.type === "page" && p.webSocketDebuggerUrl && p.url.startsWith(base));
      if (page) return page;
    } catch {}
    await sleep(300);
  }
  throw new Error("Headless Chrome target not found");
}

const target = await findTab();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject) => {
  socket.addEventListener("open",resolve,{once:true});
  socket.addEventListener("error",reject,{once:true});
});
let id = 0;
const waiting = new Map();
socket.addEventListener("message",event => {
  const m = JSON.parse(event.data);
  const pending = waiting.get(m.id);
  if (!pending) return;
  waiting.delete(m.id);
  clearTimeout(pending.timer);
  if (m.error || m.result?.exceptionDetails) pending.reject(new Error(m.error?.message || m.result?.exceptionDetails?.text || "Chrome evaluation error"));
  else pending.resolve(m.result?.result?.value ?? m.result);
});
function call(method,params={}) {
  return new Promise((resolve,reject) => {
    const key = ++id;
    const timer = setTimeout(() => { waiting.delete(key);reject(new Error("Chrome CDP timed out: "+method));},25000);
    waiting.set(key,{resolve,reject,timer});
    socket.send(JSON.stringify({id:key,method,params}));
  });
}
const evaluate = expression => call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});

async function inspect(width,height,mobile) {
  await call("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile});
  // Navigate after applying viewport; wait for a newly committed public document.
  await call("Page.navigate",{url:base+"/"});
  for(let i=0;i<70;i++){
    const d=await evaluate(`(() => {
      const grid = document.querySelector('main > section > div.relative.mx-auto.grid');
      const heading = document.querySelector('main h1');
      const quick = document.querySelector('section[aria-label="Explore business modules"]');
      const visual = document.querySelector('img[src="/marketing-dashboard.jpg"]');
      if (!grid || !heading || !quick || !visual || location.pathname !== "/") return null;
      return {
        width:innerWidth,
        contentWidth:grid.getBoundingClientRect().width,
        headingPx:parseFloat(getComputedStyle(heading).fontSize),
        quickTop:quick.getBoundingClientRect().top,
        quickCount:quick.querySelectorAll('a[href="#features"]').length,
        imageWidth:visual.getBoundingClientRect().width,
        horizontalOverflow:document.documentElement.scrollWidth - innerWidth,
        mobileMenuVisible:(() => { const el=document.querySelector('nav[aria-label="Mobile navigation"]');return !!el && getComputedStyle(el).display !== "none" })(),
        productTour:!!document.querySelector('#product-tour'),
        businessWorkflow:!!document.querySelector('#workflows'),
      };
    })()`);
    if (d && d.width===width && d.quickCount===8 && d.imageWidth>0 && d.productTour && d.businessWorkflow) return d;
    await sleep(250);
  }
  throw new Error("Homepage not ready at viewport "+width);
}
try {
  for(const width of [1366,1920]){
    const d=await inspect(width,900,false);
    assert.ok(d.contentWidth >= d.width*.85,"Desktop too narrow: "+JSON.stringify(d));
    assert.ok(d.headingPx<=62,"Desktop headline oversized: "+JSON.stringify(d));
    assert.ok(d.quickTop<=1120,"Quick modules too far below fold: "+JSON.stringify(d));
    assert.ok(d.horizontalOverflow<=2,"Desktop horizontal overflow: "+JSON.stringify(d));
    console.log("Dense desktop homepage PASS",JSON.stringify(d));
  }
  const phone=await inspect(390,844,true);
  assert.ok(phone.headingPx<=46,"Mobile headline oversized");
  assert.ok(phone.horizontalOverflow<=2,"Mobile horizontal overflow: "+JSON.stringify(phone));
  assert.ok(phone.quickCount===8 && phone.productTour && phone.businessWorkflow);
  console.log("Responsive 390px homepage PASS",JSON.stringify(phone));
} finally {
  // This suite shares a Chrome tab with the downstream commercial E2E smoke.
  // Reset both viewport AND route; otherwise that smoke reads the marketing page
  // instead of its expected authenticated/demo dashboard.
  await call("Emulation.clearDeviceMetricsOverride").catch(()=>{});
  await call("Page.navigate",{url:base+"/dashboard"});
  for(let i=0;i<60;i++){
    const restored=await evaluate('location.pathname === "/dashboard" && !!document.querySelector("body")').catch(()=>false);
    if(restored) break;
    if(i===59) throw new Error("Could not navigate shared browser to dashboard before downstream smoke");
    await sleep(200);
  }
  socket.close();
}
