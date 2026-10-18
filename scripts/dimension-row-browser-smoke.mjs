// Real-browser acceptance of the shared editor, isolated from customer billing.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const viteRequire=createRequire(require.resolve('vite',{paths:[process.cwd()+'/apps/desktop']}));
const {build}=viteRequire('esbuild');
const base=process.env.MINARVA_WEB_BASE || 'http://127.0.0.1:3000';
const cdp=process.env.MINARVA_WEB_CDP || 'http://127.0.0.1:9223';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pages=await (await fetch(cdp+'/json/list')).json();
const target=pages.find(p=>p.type==='page'&&p.url.startsWith(base)&&p.webSocketDebuggerUrl);
assert.ok(target,'Local CI browser target is required');
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
let id=0;
const pending=new Map();
ws.addEventListener('message',event=>{
 const message=JSON.parse(event.data), request=pending.get(message.id);
 if(!request)return;
 pending.delete(message.id);clearTimeout(request.timer);
 if(message.error||message.result?.exceptionDetails)request.reject(Error(message.error?.message||message.result.exceptionDetails.exception?.description||message.result.exceptionDetails.text));
 else request.resolve(message.result?.result?.value??message.result);
});
function send(method,params={}){
 return new Promise((resolve,reject)=>{
  const requestId=++id,timer=setTimeout(()=>{pending.delete(requestId);reject(Error('CDP timeout: '+method));},20000);
  pending.set(requestId,{resolve,reject,timer});ws.send(JSON.stringify({id:requestId,method,params}));
 });
}
const evaluate=expression=>send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
async function until(expression,label){
 for(let i=0;i<60;i++){if(await evaluate(expression))return;await sleep(100);}
 throw Error('Dimensional editor timeout: '+label);
}
const bundle=await build({stdin:{contents:`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {DimensionRowEditor} from './src/components/sales/DimensionRowEditor';
const container=document.createElement('div');container.id='dimension-browser-test';
container.style.cssText='position:fixed;inset:0;background:white;z-index:2147483647;padding:24px;overflow:auto';
document.body.appendChild(container);
window.__dimensionApplied=[];
function Harness(){
 const [value,setValue]=React.useState({length:'12',width:'18',lengthUnit:'in',widthUnit:'in',billableUnit:'sqft',pieces:'2'});
 const [disabled,setDisabled]=React.useState(false);window.__dimensionDisable=setDisabled;
 return <DimensionRowEditor value={value} onChange={setValue} disabled={disabled}
   onApply={measurement=>window.__dimensionApplied.push({measurement,frozen:Object.isFrozen(measurement)})}/>;
}
window.__dimensionRoot=createRoot(container);window.__dimensionRoot.render(<Harness/>);
`,resolveDir:process.cwd()+'/packages/ui',loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',
 define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'dimension-source-only',setup(b){
 b.onResolve({filter:/^@minarvabiz\/business-logic$/},()=>({path:process.cwd()+'/packages/business-logic/src/dimensional-billing.ts'}));
 }}]});
const root="document.querySelector('#dimension-browser-test')";
const button=`${root}?.querySelector('button')`;
const status=`${root}?.querySelector('[role=status]')?.textContent`;
async function field(label){
 return evaluate(`(()=>{const root=${root};const label=[...root.querySelectorAll('label')].find(l=>l.textContent===${JSON.stringify(label)});if(!label)throw Error('Missing label');const element=document.getElementById(label.htmlFor);element.focus();if(element.select)element.select();return element.tagName;})()`);
}
async function type(label,value){
 assert.equal(await field(label),'INPUT');
 if(value)await send('Input.insertText',{text:value});
 else {await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});}
 await until(`document.activeElement?.value===${JSON.stringify(value)}`,'typed '+label);
}
async function select(label,value){
 await field(label);
 await evaluate(`(()=>{const e=document.activeElement;e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
}
try{
 await evaluate(bundle.outputFiles[0].text+';true');
 await until(`${status}==='3 sqft'`,'initial exact preview');
 // Native keyboard activation must invoke the real callback once.
 await evaluate(`${button}.focus();true`);
 assert.equal(await evaluate(`document.activeElement===${button}`),true,'Apply button must have keyboard focus');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await until('window.__dimensionApplied.length===1','keyboard Apply');
 assert.deepEqual(await evaluate('window.__dimensionApplied[0]'),{measurement:{length:'12',width:'18',lengthUnit:'in',widthUnit:'in',billableUnit:'sqft',pieces:2,quantityMilli:3000,quantity:3,algorithm:'area-v1'},frozen:true});
 await type('Length','24');await until(`${status}==='6 sqft'`,'controlled input recalculation');
 await type('Length','');await until(`${button}.disabled && !${root}.querySelector('[role=status]') && !!${root}.querySelector('[role=alert]')`,'invalid clears preview');
 await evaluate(`${button}.click();true`);assert.equal(await evaluate('window.__dimensionApplied.length'),1);
 await type('Length','1');await type('Width','100');await type('Pieces','1');
 await select('Length unit','m');await select('Width unit','cm');await select('Billable unit','sqm');
 await until(`${status}==='1 sqm'`,'mixed units');
 await evaluate(`${button}.click();true`);await until('window.__dimensionApplied.length===2','updated Apply');
 assert.equal(await evaluate('window.__dimensionApplied[1].measurement.quantityMilli'),1000);
 assert.equal(await evaluate('window.__dimensionApplied[0].measurement.quantityMilli'),3000,'Past applied snapshot must remain unchanged');
 // Native Tab follows the associated input/unit controls.
 await field('Length');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
 assert.equal(await evaluate('document.activeElement?.labels?.[0]?.textContent'),'Length unit');
 await evaluate('window.__dimensionDisable(true);true');await until(`${root}.querySelector('fieldset').disabled`,'disabled state');
 await evaluate(`${button}.click();true`);assert.equal(await evaluate('window.__dimensionApplied.length'),2);
 console.log('DIMENSION_ROW_BROWSER PASS: actual keyboard, controlled edits, mixed units, invalid/disabled refusal and immutable snapshots');
}finally{
 await evaluate(`window.__dimensionRoot?.unmount();document.querySelector('#dimension-browser-test')?.remove();delete window.__dimensionRoot;delete window.__dimensionApplied;delete window.__dimensionDisable;true`).catch(()=>{});
 ws.close();
}
