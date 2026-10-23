import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
const moduleFile=require.resolve("../service-feedback-insights.ts");
const original=require.extensions[".ts"];
require.extensions[".ts"]=(m,file)=>m._compile(
  ts.transpileModule(fs.readFileSync(file,"utf8"),{
    fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText,file);
let insights;
try{delete require.cache[moduleFile];insights=require(moduleFile);}
finally{if(original)require.extensions[".ts"]=original;else delete require.extensions[".ts"];}
const completed="2026-10-22T08:00:00.000Z";
const updated="2026-10-22T12:00:00.000Z";
const feedback=(rating=2)=>({outcome:"rated",rating,
  comment:"Customer comment remains private",source:"in_person",recordedAt:completed});
const declined={outcome:"declined",rating:null,comment:"Customer declined discussion",
  source:"phone",recordedAt:completed};
const visit=(id,override={})=>({id,orderId:"ord-"+id,branchId:"b1",
  status:"completed",completedAt:completed,updatedAt:updated,
  feedback:null,recovery:null,...override});
const recovery=(status="open",extra={})=>({
  status,dueOn:"2026-10-22",plan:"Call and offer repair",
  openedAt:"2026-10-22T08:30:00.000Z",
  contactedAt:null,contactMethod:null,contactNotes:null,
  resolvedAt:null,outcomeNotes:null,...extra,
});
test("FB03 rated, declined, waiting and legacy rows have a truthful response denominator",()=>{
  const old=visit("old");delete old.feedback;delete old.recovery;
  const r=insights.buildServiceFeedbackInsights([
    visit("rated",{feedback:feedback(2)}),
    visit("happy",{feedback:feedback(5)}),
    visit("declined",{feedback:declined}),
    visit("waiting"),old,
    visit("cancelled",{status:"cancelled",completedAt:null,feedback:null}),
  ],"2026-10-23");
  assert.deepEqual([r.completedVisits,r.responseEligibleVisits,r.legacyUntracked,
    r.rated,r.declined,r.awaitingFeedback],[5,4,1,2,1,1]);
  assert.deepEqual(r.ratingCounts,[0,1,0,0,1]);
  assert.equal(r.averageRating,3.5);
  assert.equal(r.responsePercent,75);
  assert.equal(r.lowRatings,1);
  assert.equal(r.recoveryUnopened,1);
  assert.equal(r.actions.filter(x=>x.kind==="awaiting_feedback").length,1);
  assert.equal(r.months[0].completed,5);
  assert.equal(r.months[0].rated,2);
  assert.equal(r.months[0].lowRatings,1);
});
test("FB03 recovery overdue/due today, closed/resolved and unopened are distinct",()=>{
  const contacted=recovery("contacted",{
    dueOn:"2026-10-22",contactedAt:"2026-10-22T09:00:00.000Z",
    contactMethod:"phone",contactNotes:"Customer reached by phone",
  });
  const resolved=recovery("resolved",{
    dueOn:"2026-10-22",contactedAt:"2026-10-22T09:00:00.000Z",
    contactMethod:"phone",contactNotes:"Discussed fault",
    resolvedAt:"2026-10-22T10:00:00.000Z",outcomeNotes:"Issue solved",
  });
  const r=insights.buildServiceFeedbackInsights([
    visit("unopened",{feedback:feedback(1)}),
    visit("open",{feedback:feedback(2),recovery:recovery()}),
    visit("contacted",{feedback:feedback(1),recovery:contacted}),
    visit("resolved",{feedback:feedback(2),recovery:resolved}),
    visit("today",{feedback:feedback(1),recovery:recovery("open",{dueOn:"2026-10-23"})}),
  ],"2026-10-23");
  assert.deepEqual([r.recoveryUnopened,r.recoveryOpen,r.recoveryContacted,
    r.recoveryResolved,r.recoveryOverdue],[1,2,1,1,2]);
  assert.deepEqual(r.actions.map(x=>x.kind),[
    "recovery_overdue","recovery_overdue","recovery_due_today","recovery_unopened"
  ]);
  assert.equal(r.actions[0].visitId,"contacted");
});
test("FB03 inclusive UTC completion-date filter excludes other months without leaking comments",()=>{
  const nov=visit("nov",{
    completedAt:"2026-11-02T10:00:00.000Z",
    updatedAt:"2026-11-02T12:00:00.000Z",
    feedback:{...feedback(5),recordedAt:"2026-11-02T11:00:00.000Z"},
  });
  const r=insights.buildServiceFeedbackInsights([visit("oct",{feedback:declined}),nov],
    "2026-11-05","2026-11-01","2026-11-02");
  assert.equal(r.completedVisits,1);
  assert.equal(r.declined,0);
  assert.equal(r.rated,1);
  assert.equal(r.months[0].month,"2026-11");
  assert.equal(r.months[0].completed,1);
  assert.deepEqual(insights.buildServiceFeedbackInsights([],"2026-10-23"),{
    branchId:null,completedVisits:0,responseEligibleVisits:0,legacyUntracked:0,
    awaitingFeedback:0,rated:0,declined:0,averageRating:null,
    responsePercent:null,ratingCounts:[0,0,0,0,0],lowRatings:0,
    recoveryOpen:0,recoveryContacted:0,recoveryResolved:0,
    recoveryClosedUnresolved:0,recoveryOverdue:0,recoveryUnopened:0,
    months:[],actions:[],
  });
});
test("FB03 rejects mixed branch records and duplicate visits rather than presenting cross-branch stats",()=>{
  assert.throws(()=>insights.buildServiceFeedbackInsights([
    visit("a"),visit("b",{branchId:"other"}),
  ],"2026-10-23"),/mix branches/);
  assert.throws(()=>insights.buildServiceFeedbackInsights([
    visit("a"),visit("a"),
  ],"2026-10-23"),/Duplicate/);
  for(const raw of [null,{},[{status:"completed"}]])assert.throws(
    ()=>insights.buildServiceFeedbackInsights(raw,"2026-10-23"));
});
test("FB03 validates UTC chronology and bad filters without silently changing sample",()=>{
  for(const today of ["2026-02-30","2026-10-23T00:00Z","2026-13-01"]){
    assert.throws(()=>insights.buildServiceFeedbackInsights([visit("a")],today));
  }
  assert.throws(()=>insights.buildServiceFeedbackInsights([visit("a")],
    "2026-10-23","2026-11-01","2026-10-01"),/start date exceeds/);
  for(const v of [
    visit("bad",{completedAt:"invalid"}),
    visit("bad",{updatedAt:"2026-10-22T07:00:00.000Z"}),
    visit("bad",{feedback:{...feedback(2),rating:6}}),
    visit("bad",{feedback:declined,recovery:recovery()}),
    visit("bad",{feedback:feedback(4),recovery:recovery()}),
    visit("bad",{feedback:null,recovery:recovery()}),
    visit("bad",{feedback:feedback(2),recovery:recovery("open",{dueOn:"invalid"})}),
  ])assert.throws(()=>insights.buildServiceFeedbackInsights([v],"2026-10-23"));
});
test("FB03 CSV excludes comment, phone, staff PII and spreadsheet injection by visit/order IDs",()=>{
  const r=insights.buildServiceFeedbackInsights([
    visit("=WEBSERVICE()",{orderId:"-4+5",feedback:null}),
    visit("@cmd",{orderId:"+DDE",feedback:feedback(1)}),
  ],"2026-10-23");
  const csv=insights.exportServiceFeedbackInsightsCsv(r);
  assert.match(csv,/"'=WEBSERVICE\(\)"/);
  assert.match(csv,/"'-4\+5"/);
  assert.match(csv,/"'@cmd"/);
  assert.match(csv,/"'\+DDE"/);
  assert.doesNotMatch(csv,/Customer comment remains private/);
  assert.match(csv,/Completion month/);
  assert.match(csv,/Feedback-eligible visits/);
  assert.ok(csv.endsWith("\r\n"));
});
test("FB03 UI reads already branch-scoped report permission visits; no auto send or storage writes",()=>{
  const root=new URL("../../../",import.meta.url);
  const panel=fs.readFileSync(new URL(
    "ui/src/components/orders/ServiceSiteVisitPanel.tsx",root),"utf8");
  const dashboard=fs.readFileSync(new URL(
    "ui/src/components/orders/ServiceFeedbackInsightsPanel.tsx",root),"utf8");
  const entry=fs.readFileSync(new URL(
    "business-logic/src/index.ts",root),"utf8");
  assert.match(panel,/if\(!canRead\)return null/);
  assert.match(panel,/visits=listServiceSiteVisits\(\)/);
  assert.match(panel,/<ServiceFeedbackInsightsPanel visits=\{visits\}/);
  assert.match(dashboard,/buildServiceFeedbackInsights\(visits,today/);
  assert.match(dashboard,/exportServiceFeedbackInsightsCsv\(report\)/);
  assert.match(dashboard,/type="date"/);
  assert.doesNotMatch(dashboard,/window\.open|queueOrderStatusMessage/);
  assert.match(entry,/export \* from "\.\/service-feedback-insights"/);
});
