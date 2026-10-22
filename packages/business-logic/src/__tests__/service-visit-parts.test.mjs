import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
const path=require.resolve("../service-visit-parts.ts");
const previous=require.extensions[".ts"];
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(
  fs.readFileSync(file,"utf8"),{
    fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
  }).outputText,file);
let parts;
try{delete require.cache[path];parts=require(path);}
finally{if(previous)require.extensions[".ts"]=previous;else delete require.extensions[".ts"];}
const now="2026-10-22T08:00:00.000Z";
const entry={
  id:"e1",productId:"p1",productName:"CCTV Power Supply",
  sku:"SMPS-12V",unit:"pcs",quantityMilli:2500,unitCostMinor:12525,
  totalCostMinor:31313,notes:"Replaced old power adapter",
  recordedAt:now,status:"used",voidedAt:null,voidReason:null,
};
test("part quantity accepts strict 0.001 precision without rounding surprising input",()=>{
  for(const [input,expected] of [["1",1000],["1.2",1200],["0.001",1],["2.125",2125],["0002.000",2000]]){
    assert.equal(parts.parseServicePartQuantity(input),expected);
  }
  for(const input of ["","0","0.000","1.0009","1e2","-5","1,000","Infinity",
    ".2","1.","-0.001","1\n2"]){
    assert.throws(()=>parts.parseServicePartQuantity(input));
  }
});
test("parts use integer minor units and deterministic half-up rounding",()=>{
  assert.equal(parts.costPartMinor(2500,12525),31313);
  assert.equal(parts.costPartMinor(1,555),1);
  assert.equal(parts.costPartMinor(1000,0),0);
  for(const q of [0,-1,1.5,1e20])assert.throws(()=>parts.costPartMinor(q,100));
  for(const c of [-1,1.2,1e20])assert.throws(()=>parts.costPartMinor(1000,c));
});
test("valid part record is cloned after full chronology / cost checks",()=>{
  assert.deepEqual(parts.validateServiceVisitPart(entry,now,now,"arrived"),entry);
  assert.deepEqual(parts.validateServiceVisitPart(entry,now,now,"completed"),entry);
  assert.equal(parts.validateServiceVisitParts([entry],now,now,"arrived").length,1);
});
test("reject impossible unarrived, fabricated costs and snapshot fields",()=>{
  for(const patch of [
    {quantityMilli:0},{quantityMilli:1001},{totalCostMinor:42},
    {unitCostMinor:-2},{unitCostMinor:0.5},
    {id:""},{productId:""},{productName:""},
    {unit:""},{status:"future"},{recordedAt:"bad"},
    {notes:"evil\nvalue"},{voidReason:"wrong"},{voidedAt:now},
    {unexpected:"yes"},
  ]){
    assert.throws(()=>parts.validateServiceVisitPart({...entry,...patch},now,now,"arrived"),
      undefined,JSON.stringify(patch));
  }
  assert.throws(()=>parts.validateServiceVisitPart(entry,null,now,"scheduled"),/arrival/);
  assert.throws(()=>parts.validateServiceVisitPart(entry,now,now,"cancelled"),/arrival/);
  assert.throws(()=>parts.validateServiceVisitPart(entry,"2026-10-23T08:00:00.000Z",now,"arrived"),/arrival/);
  assert.throws(()=>parts.validateServiceVisitPart(entry,now,"2026-10-21T08:00:00.000Z","arrived"),/arrival/);
});
test("voided parts require correction reason, timeline, immutable original cost",()=>{
  const voided={...entry,status:"voided",voidedAt:now,voidReason:"Wrong usage entry"};
  assert.deepEqual(parts.validateServiceVisitPart(voided,now,now,"arrived"),voided);
  for(const patch of [
    {voidReason:null},{voidReason:"x"},{voidedAt:null},
    {voidedAt:"2025-01-01T00:00:00.000Z"},
    {voidedAt:"2027-01-01T00:00:00.000Z"},
  ])assert.throws(()=>parts.validateServiceVisitPart({...voided,...patch},now,now,"arrived"));
});
test("duplicate IDs and overcapacity arrays cannot enter snapshots",()=>{
  assert.throws(()=>parts.validateServiceVisitParts([entry,entry],now,now,"arrived"),/Duplicate/);
  assert.throws(()=>parts.validateServiceVisitParts({},now,now,"arrived"),/collection/);
  assert.throws(()=>parts.validateServiceVisitParts(Array(51).fill(entry),now,now,"arrived"),/collection/);
  assert.deepEqual(parts.validateServiceVisitParts([],null,now,"scheduled"),[]);
});
test("cost summary excludes voids, rejects overflow, and reports correction count",()=>{
  const other={...entry,id:"e2",totalCostMinor:100,quantityMilli:1000,unitCostMinor:100};
  const voided={...entry,id:"e3",status:"voided",voidedAt:now,voidReason:"Other part used"};
  assert.deepEqual(parts.summarizeServiceVisitParts([entry,other,voided]),
    {usedCount:2,voidedCount:1,totalCostMinor:31413});
  assert.deepEqual(parts.summarizeServiceVisitParts([]),
    {usedCount:0,voidedCount:0,totalCostMinor:0});
  assert.throws(()=>parts.summarizeServiceVisitParts(Array(2).fill({
    ...entry,totalCostMinor:100_000_000_000})),/summary exceeds/);
});
