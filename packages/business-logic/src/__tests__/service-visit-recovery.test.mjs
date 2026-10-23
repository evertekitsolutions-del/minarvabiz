import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
const file=require.resolve("../service-visit-recovery.ts");
const oldExt=require.extensions[".ts"];
require.extensions[".ts"]=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,"utf8"),{
  fileName:p,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,p);
let recovery;
try{delete require.cache[file];recovery=require(file);}
finally{if(oldExt)require.extensions[".ts"]=oldExt;else delete require.extensions[".ts"];}
const now="2026-10-22T08:00:00.000Z";
const feedback={outcome:"rated",rating:2,comment:"Camera disconnection",
  source:"phone",recordedAt:now};
const open={status:"open",dueOn:"2026-10-23",plan:"Call customer and investigate",
  openedAt:now,contactedAt:null,contactMethod:null,contactNotes:null,
  resolvedAt:null,outcomeNotes:null};
const contacted={...open,status:"contacted",contactedAt:now,
  contactMethod:"phone",contactNotes:"Spoke to customer about repeat fault"};
const closed={...contacted,status:"resolved",resolvedAt:now,
  outcomeNotes:"Technician repaired cable and customer confirmed it worked"};
const verify=(item,f=feedback,status="completed",at=now)=>
  recovery.validateServiceVisitRecovery(item,f,status,at);
test("recovery only applies after a real low rating in completed visit",()=>{
  assert.deepEqual(verify(open),open);
  assert.deepEqual(verify(contacted),contacted);
  assert.deepEqual(verify(closed),closed);
  assert.deepEqual(verify({...closed,status:"closed_unresolved"}),{
    ...closed,status:"closed_unresolved"});
  assert.equal(verify(null),null);
  for(const [f,s] of [[null,"completed"],[{...feedback,rating:3},"completed"],
    [feedback,"scheduled"],[feedback,"arrived"],[feedback,"cancelled"],
    [{...feedback,outcome:"declined",rating:null},"completed"]]){
    assert.throws(()=>verify(open,f,s),/completed visit/);
  }
});
test("strict recovery case chronology and status-specific fields reject fake contact/outcome",()=>{
  const examples=[
    {...open,dueOn:"2026-02-30"},
    {...open,dueOn:"2026-10-21"},
    {...open,openedAt:"2026-10-22T08:00:00Z"},
    {...open,openedAt:"2026-10-23T08:00:00.000Z"},
    {...open,plan:"no"},
    {...open,plan:"x".repeat(801)},
    {...open,plan:"bad\nline"},
    {...open,contactedAt:now},
    {...open,contactMethod:"phone"},
    {...open,contactNotes:"Customer called"},
    {...contacted,contactMethod:"email"},
    {...contacted,contactNotes:"no"},
    {...contacted,contactedAt:"2026-10-21T08:00:00.000Z"},
    {...contacted,contactedAt:"2026-10-23T08:00:00.000Z"},
    {...contacted,resolvedAt:now},
    {...closed,resolvedAt:null},
    {...closed,outcomeNotes:null},
    {...closed,outcomeNotes:"no"},
    {...closed,resolvedAt:"2026-10-21T08:00:00.000Z"},
    {...closed,status:"unknown"},
    {...open,foreignBranch:"branch2"},
  ];
  for(const x of examples)
    assert.throws(()=>verify(x),undefined,JSON.stringify(x));
  assert.throws(()=>verify({...open,openedAt:"2026-10-21T08:00:00.000Z"}),
    /chronology/);
  assert.throws(()=>verify(open,feedback,"completed","not a time"),/timestamp/);
});
test("recovery counts overdue once, ignores resolved/old cases and uses due day not hour",()=>{
  const report=recovery.summarizeServiceVisitRecovery([
    open,open,contacted,closed,{...closed,status:"closed_unresolved"},null,undefined,
  ],"2026-10-24");
  assert.deepEqual(report,{open:2,contacted:1,overdue:3,resolved:1,
    closedUnresolved:1});
  assert.equal(recovery.summarizeServiceVisitRecovery([open,contacted],
    "2026-10-23").overdue,0);
  assert.throws(()=>recovery.summarizeServiceVisitRecovery([open],"2026-02-30"),
    /due date/);
});
test("audit metadata omits free-text private customer recovery details",()=>{
  const a=recovery.recoveryAudit(closed);
  assert.deepEqual(a,{status:"resolved",dueOn:"2026-10-23",openedAt:now,
    contactedAt:now,contactMethod:"phone",resolvedAt:now});
  assert.ok(!JSON.stringify(a).includes("cable"));
  assert.equal(recovery.recoveryAudit(null),null);
});
test("FB02 UI exposes staff-confirmed recovery actions but no automatic send",()=>{
  const root=new URL("../../../",import.meta.url);
  const ui=fs.readFileSync(new URL(
    "ui/src/components/orders/ServiceVisitRecoveryPanel.tsx",root),"utf8");
  const panel=fs.readFileSync(new URL(
    "ui/src/components/orders/ServiceSiteVisitPanel.tsx",root),"utf8");
  assert.match(ui,/openServiceVisitRecovery\(/);
  assert.match(ui,/confirmServiceVisitRecoveryContact\(/);
  assert.match(ui,/closeServiceVisitRecovery\(/);
  assert.match(ui,/summarizeServiceVisitRecovery\(/);
  assert.match(ui,/can\("orders\.assign"\)/);
  assert.match(panel,/<ServiceRecoverySummary visits=\{visits\}/);
  assert.match(panel,/<ServiceVisitRecoveryPanel visit=\{v\}/);
  assert.doesNotMatch(ui,/\bfetch\(|window\.open\(|setInterval\(/);
});
