// React DOM acceptance with an isolated host; no production data or API credentials.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import vm from 'node:vm';
import {buildBigcapitalJournalPreview,parseBigcapitalCatalog} from '../packages/business-logic/src/bigcapital-journal-preview.ts';
const require=createRequire(import.meta.url),ts=require('typescript'),React=require('react');
const jsdomPath=process.env.POS_TEST_MODULES?`${process.env.POS_TEST_MODULES}/jsdom/lib/api.js`:'jsdom';
const {JSDOM}=require(jsdomPath),dom=new JSDOM('<div id="root"></div>',{url:'https://local.test'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
const {createRoot}=require('react-dom/client');const {act}=React;
let branch='b1',allowed=true,captured;
URL.createObjectURL=blob=>{captured=blob;return 'blob:test';};URL.revokeObjectURL=()=>{};
dom.window.HTMLAnchorElement.prototype.click=function(){};
const compiled=ts.transpileModule(readFileSync('packages/ui/src/components/accounting/BigcapitalJournalPreviewPanel.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
const stubRequire=name=>{
 if(name==='react')return React;
 if(name==='@minarvabiz/business-logic')return {buildBigcapitalJournalPreview,parseBigcapitalCatalog,assertPermission:()=>{if(!allowed)throw Error('Denied');},phase9Store:{getActiveBranch:()=>({id:branch,name:branch}),listBranches:()=>[{id:'b1',isHeadquarters:true}]},getShopProfile:()=>({currency:'INR'})};
 if(name==='../Button')return {Button:({children,size,variant,...props})=>React.createElement('button',props,children)};
 if(name==='../forms/FormField')return {FormField:({label,children})=>React.createElement('label',null,label,children),inputClass:'',selectClass:''};
 throw Error('Unexpected dependency '+name);
};
vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`,{console,Blob,URL,document,window,Error})(stubRequire,mod,mod.exports);
const {BigcapitalJournalPreviewPanel:Panel}=mod.exports;
const accounts=[{id:'cash',code:'100',name:'Cash'},{id:'sales',code:'400',name:'Sales'}];
const journals=[{id:'j',journalNumber:'J-1',entryDate:'2026-01-01',description:'Sale',status:'posted',version:1,branchId:'b1',totalDebit:100,totalCredit:100,lines:[{id:'l1',journalEntryId:'j',accountId:'cash',debit:100,credit:0},{id:'l2',journalEntryId:'j',accountId:'sales',debit:0,credit:100}]}];
const catalog={schema:'minarva.bigcapital.accounts.v1',origin:'https://accounting.example',organizationId:'org1',baseCurrency:'INR',branches:[{id:1,name:'Main'}],accounts:[{id:1,code:'100',name:'Cash',active:true,currency:'INR'},{id:2,code:'400',name:'Sales',active:true,currency:'INR'}]};
const root=createRoot(document.getElementById('root'));
const field=label=>[...document.querySelectorAll('label')].find(e=>e.textContent.startsWith(label)).querySelector('input,select');
async function fill(label,value){const el=field(label),proto=el.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype;await act(async()=>{Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
async function loadCatalog(){const el=field('Bigcapital account catalog JSON');Object.defineProperty(el,'files',{configurable:true,value:[{size:1000,text:async()=>JSON.stringify(catalog)}]});await act(async()=>el.dispatchEvent(new window.Event('change',{bubbles:true})));}
test('existing accounting panel opt-in → catalog → mapping → journal download; permission/branch change invalidates',async()=>{
 await act(async()=>root.render(React.createElement(Panel,{journals,accounts})));
 assert.equal(document.querySelectorAll('input[type=file]').length,0);
 await act(async()=>document.querySelector('input[type=checkbox]').click());await loadCatalog();
 await fill('Stable source workspace ID','shop');await fill('Target Bigcapital branch ID','1');await fill('From','2026-01-01');await fill('Through','2026-01-31');await fill('100 — Cash','1');await fill('400 — Sales','2');
 assert.equal(document.querySelector('button').disabled,false);
 await act(async()=>document.querySelector('button').click());assert(captured);const output=JSON.parse(await captured.text());assert.equal(output.journalCount,1);assert.equal(output.journals[0].payload.publish,false);
 captured=null;allowed=false;await act(async()=>document.querySelector('button').click());assert.equal(captured,null);assert.match(document.body.textContent,/Denied/);
 allowed=true;branch='b2';await act(async()=>root.render(React.createElement(Panel,{journals,accounts})));assert.equal(document.querySelector('input[type=checkbox]').checked,false);assert.equal(document.querySelectorAll('input[type=file]').length,0);
 await act(async()=>root.unmount());
});
