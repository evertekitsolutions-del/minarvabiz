import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
const path=require.resolve("../service-visit-sla.ts");
const ext=require.extensions[".ts"];
require.extensions[".ts"]=(m,file)=>m._compile(ts.transpileModule(
  fs.readFileSync(file,"utf8"),{fileName:file,
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText,file);
let sla;
try{delete require.cache[path];sla=require(path);}
finally{if(ext)require.extensions[".ts"]=ext;else delete require.extensions[".ts"];}
const T="2026-10-22T08:00:00.000Z";
function target(arrival="2026-10-22T10:00:00.000Z",completion="2026-10-22T15:00:00.000Z"){
  return {arrivalDueAt:arrival,completionDueAt:completion};
}
function visit(override={}){
  return {id:"v1",orderId:"o1",scheduledOn:"2026-10-22",
    status:"scheduled",arrivedAt:null,completedAt:null,sla:target(),...override};
}
test("validates explicit immutable UTC deadline pair and nullable single target",()=>{
  assert.deepEqual(sla.validateServiceVisitSla(target(),T),target());
  assert.deepEqual(sla.validateServiceVisitSla(target(null,"2026-10-23T08:00:00.000Z"),T),
    target(null,"2026-10-23T08:00:00.000Z"));
  assert.deepEqual(sla.validateServiceVisitSla(target("2026-10-22T09:00:00.000Z",null),T),
    target("2026-10-22T09:00:00.000Z",null));
});
test("rejects untrusted SLA deadline data and forged fields",()=>{
  const invalid=[
    null,[],{},target(null,null),target("2025-10-21T08:00:00.000Z",null),
    target("2026-02-30T10:00:00.000Z",null),
    target("2026-10-22T10:00:00+02:00",null),
    target("2026-10-22",null),
    target("2026-10-22T10:00:00.000Z","2026-10-22T09:00:00.000Z"),
    {...target(),bogus:"override"},
    {arrivalDueAt:"2026-10-22T10:00:00.000Z"},
    {arrivalDueAt:false,completionDueAt:null},
    {arrivalDueAt:null,completionDueAt:10},
  ];
  for(const i of invalid)assert.throws(()=>sla.validateServiceVisitSla(i,T),
    undefined,JSON.stringify(i));
  assert.throws(()=>sla.validateServiceVisitSla(target(),"yesterday"),/timestamp/);
});
test("per-deadline due-soon is inclusive, overdue only after deadline",()=>{
  const exact=sla.buildServiceVisitSlaReport([visit()],"2026-10-22T10:00:00.000Z",120);
  assert.equal(exact.rows[0].arrival.status,"due_soon");
  assert.equal(exact.rows[0].completion.status,"on_track");
  const overdue=sla.buildServiceVisitSlaReport([visit()],"2026-10-22T10:00:00.001Z",120);
  assert.equal(overdue.rows[0].arrival.status,"overdue");
  assert.equal(overdue.overdueVisits,1);
  assert.equal(overdue.dueSoonVisits,0);
  const near=sla.buildServiceVisitSlaReport([visit()],"2026-10-22T08:00:00.000Z",120);
  assert.equal(near.rows[0].arrival.status,"due_soon");
  assert.equal(near.trackedVisits,1);
});
test("arrival and completion on-time/missed use actual timestamps, not current clock",()=>{
  const report=sla.buildServiceVisitSlaReport([visit({
    status:"completed",arrivedAt:"2026-10-22T10:00:00.000Z",
    completedAt:"2026-10-22T15:00:00.001Z",
  })],"2026-10-24T12:00:00.000Z");
  assert.equal(report.rows[0].arrival.status,"met");
  assert.equal(report.rows[0].arrival.minutesFromDeadline,0);
  assert.equal(report.rows[0].completion.status,"missed");
  assert.equal(report.rows[0].completion.minutesFromDeadline,1);
  assert.equal(report.missedVisits,1);
  assert.equal(report.overdueVisits,0);
  const early=sla.buildServiceVisitSlaReport([visit({
    status:"arrived",arrivedAt:"2026-10-22T09:00:00.000Z",
  })],"2026-10-22T11:00:00.000Z");
  assert.equal(early.rows[0].arrival.status,"met");
  assert.equal(early.rows[0].arrival.minutesFromDeadline,-60);
  assert.equal(early.rows[0].completion.status,"on_track");
});
test("cancelled visits do not generate misleading overdue breaches",()=>{
  const report=sla.buildServiceVisitSlaReport([visit({status:"cancelled"})],
    "2026-10-24T08:00:00.000Z");
  assert.equal(report.cancelledVisits,1);
  assert.equal(report.rows[0].arrival.status,"cancelled");
  assert.equal(report.rows[0].completion.status,"cancelled");
  assert.equal(report.overdueVisits,0);
  assert.equal(report.missedVisits,0);
});
test("legacy no-target visits remain untracked and rows sort by action priority",()=>{
  const untracked=visit({id:"legacy",sla:undefined});
  const dueSoon=visit({id:"soon",sla:target("2026-10-22T11:00:00.000Z",null)});
  const missed=visit({id:"missed",status:"arrived",
    arrivedAt:"2026-10-22T12:00:00.000Z"});
  const overdue=visit({id:"overdue"});
  const report=sla.buildServiceVisitSlaReport([untracked,dueSoon,missed,overdue],
    "2026-10-22T10:30:00.000Z",60);
  assert.deepEqual(report.rows.map(r=>r.visitId),["overdue","soon","missed","legacy"]);
  assert.equal(report.trackedVisits,3);
  assert.equal(report.overdueVisits,1);
  assert.equal(report.dueSoonVisits,1);
  assert.equal(report.missedVisits,1);
  assert.equal(report.rows.at(-1).completion.status,"untracked");
});
test("rejects invalid SLA report evaluation time, warning and visit fields",()=>{
  for(const t of ["", "2026-10-22", "2026-10-22T10:00:00Z"]){
    assert.throws(()=>sla.buildServiceVisitSlaReport([visit()],t),/timestamp/);
  }
  for(const minutes of [-1,1.5,10081]){
    assert.throws(()=>sla.buildServiceVisitSlaReport([visit()],T,minutes),/warning/);
  }
  for(const v of [null,{...visit(),id:42},{...visit(),scheduledOn:"other"},
    {...visit(),status:"finished"},{...visit(),sla:target(null,null)}]){
    assert.throws(()=>sla.buildServiceVisitSlaReport([v],T),undefined,JSON.stringify(v));
  }
  assert.throws(()=>sla.buildServiceVisitSlaReport("bad",T),/source/);
});
test("CSV is readable and escapes cells that spreadsheet apps treat as formulas",()=>{
  const csv=sla.exportServiceVisitSlaCsv(
    sla.buildServiceVisitSlaReport([
      visit({id:"=cmd",orderId:"+SUM(1,2)",sla:target(null,"2026-10-23T15:00:00.000Z")}),
    ],T));
  assert.match(csv,/"'=cmd"/);
  assert.match(csv,/"'\+SUM\(1,2\)"/);
  assert.match(csv,/"Completion deadline"/);
  assert.match(csv,/"on_track"/);
  assert.ok(csv.endsWith("\r\n"));
});
test("SVC-012 UI schedules local datetime, evaluates deadlines and exports CSV",()=>{
  const root=new URL("../../../",import.meta.url);
  const ui=fs.readFileSync(new URL("ui/src/components/orders/ServiceSiteVisitPanel.tsx",root),"utf8");
  const report=fs.readFileSync(new URL("ui/src/components/orders/ServiceVisitSlaPanel.tsx",root),"utf8");
  const store=fs.readFileSync(new URL("business-logic/src/service-site-visit-register.ts",root),"utf8");
  const entry=fs.readFileSync(new URL("business-logic/src/index.ts",root),"utf8");
  assert.match(ui,/type="datetime-local"/);
  assert.match(ui,/sla:\{arrivalDueAt,completionDueAt\}/);
  assert.match(ui,/<ServiceVisitSlaPanel visits=\{visits\}/);
  assert.match(report,/buildServiceVisitSlaReport\(visits/);
  assert.match(report,/exportServiceVisitSlaCsv\(report\)/);
  assert.match(store,/validateServiceVisitSla\(input\.sla,now\)/);
  assert.match(store,/validateServiceVisitSla\(o\.sla,v\.createdAt\)/);
  assert.match(entry,/export \* from "\.\/service-visit-sla"/);
});
