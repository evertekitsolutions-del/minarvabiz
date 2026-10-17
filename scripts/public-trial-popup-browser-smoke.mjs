// Headless-Chrome acceptance of the actual React marketing popup triggers.
// Runs against the already-started local Next.js web + CDP browser in CI.
import assert from "node:assert/strict";

const base = process.env.MINARVA_WEB_BASE || "http://127.0.0.1:3000";
const chrome = process.env.MINARVA_WEB_CDP || "http://127.0.0.1:9223";
const pause = ms => new Promise(done => setTimeout(done,ms));

async function pageTarget() {
  for (let n=0;n<60;n++) {
    try {
      const res=await fetch(chrome+"/json/list");
      const pages=await res.json();
      const p=pages.find(x=>x.type==="page"&&x.url.startsWith(base)&&x.webSocketDebuggerUrl);
      if(p) return p;
    } catch {}
    await pause(250);
  }
  throw Error("Chrome tab missing for trial popup test");
}

const target=await pageTarget();
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{
  ws.addEventListener("open",resolve,{once:true});
  ws.addEventListener("error",reject,{once:true});
});
let counter=0;
const requests=new Map();
ws.addEventListener("message",e=>{
  const msg=JSON.parse(e.data);
  const request=requests.get(msg.id);
  if(!request)return;
  requests.delete(msg.id);
  clearTimeout(request.timer);
  if(msg.error||msg.result?.exceptionDetails)
    request.reject(Error(msg.error?.message||msg.result?.exceptionDetails?.text||"CDP error"));
  else request.resolve(msg.result?.result?.value??msg.result);
});
function send(method,params={}) {
  return new Promise((resolve,reject)=>{
    const id=++counter;
    const timer=setTimeout(()=>{requests.delete(id);reject(Error("CDP timeout: "+method));},20_000);
    requests.set(id,{resolve,reject,timer});
    ws.send(JSON.stringify({id,method,params}));
  });
}
const evalJS = expr => send("Runtime.evaluate", {expression:expr,returnByValue:true,awaitPromise:true});
async function waitFor(expr,label) {
  for(let n=0;n<70;n++){
    if(await evalJS(expr).catch(()=>false))return;
    await pause(170);
  }
  throw Error("Timeout awaiting "+label);
}
const dialog='document.querySelector("[aria-labelledby=trial-popup-title]")';
async function goHome(){
  await send("Page.navigate",{url:base+"/"});
  await waitFor('location.pathname === "/" && !!document.querySelector("main h1")',"homepage");
  // Allow React hydration/effects to subscribe after the SSR DOM is visible.
  await pause(1300);
}
try {
  await send("Emulation.setDeviceMetricsOverride",{width:1366,height:900,mobile:false,deviceScaleFactor:1});
  await send("Emulation.setTouchEmulationEnabled",{enabled:false});
  // Other smoke tests share this browser profile; start from a clean tab marker.
  await evalJS('sessionStorage.removeItem("minarva-biz-marketing-trial-v2")');
  await goHome();
  assert.equal(await evalJS('matchMedia("(hover: hover) and (pointer: fine)").matches'),true);
  assert.equal(await evalJS('!!'+dialog),false,"Never show popup simply on load");
  await evalJS('document.dispatchEvent(new MouseEvent("mouseout",{bubbles:true,clientY:460,relatedTarget:null}))');
  assert.equal(await evalJS('!!'+dialog),false,"Side/bottom exit must not interrupt users");
  await evalJS('document.dispatchEvent(new MouseEvent("mouseout",{bubbles:true,clientY:0,relatedTarget:document.body}))');
  assert.equal(await evalJS('!!'+dialog),false,"Moving between elements is not exit intent");
  await evalJS('document.dispatchEvent(new MouseEvent("mouseout",{bubbles:true,clientY:0,relatedTarget:null}))');
  await waitFor('!!'+dialog,"desktop exit-intent popup");
  assert.ok((await evalJS(dialog+'.innerText')).includes("Days Free Trial"));
  await evalJS('document.querySelector("button[aria-label^=Close]").click()');
  await waitFor('!'+dialog,"desktop dismissal");

  // Do not repeat after navigation inside the same tab.
  await goHome();
  await evalJS('document.dispatchEvent(new MouseEvent("mouseout",{bubbles:true,clientY:0,relatedTarget:null}))');
  assert.equal(await evalJS('!!'+dialog),false,"One per tab/session even after a fresh load");

  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,mobile:true,deviceScaleFactor:1});
  await send("Emulation.setTouchEmulationEnabled",{enabled:true,maxTouchPoints:1});
  await evalJS('sessionStorage.removeItem("minarva-biz-marketing-trial-v2")');
  await goHome();
  assert.equal(await evalJS('matchMedia("(hover: hover) and (pointer: fine)").matches'),false);
  assert.equal(await evalJS('!!'+dialog),false,"Never automatically pop on mobile load");
  await evalJS('window.scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*.25)');
  await pause(300);
  assert.equal(await evalJS('!!'+dialog),false,"No interrupt before substantial mobile engagement");
  await evalJS('window.scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*.6)');
  await waitFor('!!'+dialog,"mobile 50% scroll popup");
  await evalJS('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
  await waitFor('!'+dialog,"Escape closes trial offer");
  console.log("Real Chrome 30-day trial exit-intent and mobile-scroll popup PASS");
} finally {
  await send("Emulation.setTouchEmulationEnabled",{enabled:false}).catch(()=>{});
  await send("Emulation.clearDeviceMetricsOverride").catch(()=>{});
  await send("Page.navigate",{url:base+"/dashboard"}).catch(()=>{});
  ws.close();
}
