import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
const filename=require.resolve("../service-visit-feedback.ts");
const original=require.extensions[".ts"];
require.extensions[".ts"]=(m,file)=>m._compile(
  ts.transpileModule(fs.readFileSync(file,"utf8"),{fileName:file,
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText,file);
let domain;
try{delete require.cache[filename];domain=require(filename);}
finally{if(original)require.extensions[".ts"]=original;else delete require.extensions[".ts"];}
const doneAt="2026-10-22T08:00:00.000Z";
const rated={outcome:"rated",rating:2,comment:"Power fault repeated",
  source:"in_person",recordedAt:doneAt};
const declined={outcome:"declined",rating:null,
  comment:"Customer requested no survey",source:"phone",recordedAt:doneAt};
const validate=(v,completed=doneAt,updated=doneAt,status="completed")=>
  domain.validateServiceVisitFeedback(v,completed,updated,status);

test("rating 1 to 5 and declined feedback survive strict offline record validation",()=>{
  for(let n=1;n<=5;n++){
    assert.deepEqual(validate({...rated,rating:n}),{...rated,rating:n});
  }
  assert.deepEqual(validate(declined),declined);
  assert.equal(validate(null),null);
});
test("out-of-range, fractional and forged responses are rejected",()=>{
  for(const x of [
    {...rated,rating:0},{...rated,rating:6},{...rated,rating:1.5},
    {...rated,rating:NaN},{...rated,rating:"5"},
    {...rated,rating:null},{...rated,source:"email"},
    {...rated,comment:"x".repeat(1001)},
    {...rated,comment:"evil\ntext"},
    {...rated,extra:"hidden"},
    {...rated,recordedAt:"not a time"},
    {...rated,recordedAt:"2026-10-22T08:00:00Z"},
    {...declined,rating:1},{...declined,comment:"no"},
    {...declined,comment:""},
    {...declined,outcome:"unknown"},
  ])assert.throws(()=>validate(x),undefined,JSON.stringify(x));
});
test("pre-completion response, cancelled visits, and forged future dates are rejected",()=>{
  assert.throws(()=>validate(rated,null,doneAt,"scheduled"),/completed/);
  assert.throws(()=>validate(rated,null,doneAt,"cancelled"),/completed/);
  assert.throws(()=>validate(rated,doneAt,doneAt,"arrived"),/completed/);
  assert.throws(()=>validate({...rated,recordedAt:"2026-10-21T08:00:00.000Z"}),/chronology/);
  assert.throws(()=>validate({...rated,recordedAt:"2026-10-23T08:00:00.000Z"}),/chronology/);
});
test("only low ratings need private recovery; no public review gating",()=>{
  assert.equal(domain.feedbackNeedsRecovery({...rated,rating:1}),true);
  assert.equal(domain.feedbackNeedsRecovery({...rated,rating:2}),true);
  for(const x of [null,undefined,declined,{...rated,rating:3},
    {...rated,rating:4},{...rated,rating:5}])
    assert.equal(domain.feedbackNeedsRecovery(x),false);
});
test("feedback audit metadata cannot leak customer free-text",()=>{
  const audit=domain.feedbackAuditMetadata(rated);
  assert.deepEqual(audit,{
    outcome:"rated",rating:2,source:"in_person",recordedAt:doneAt,needsRecovery:true,
  });
  assert.ok(!JSON.stringify(audit).includes("Power fault repeated"));
  assert.equal(domain.feedbackAuditMetadata(null),null);
});
test("SVC-FB01 UI requires completed visit and opens opt-in, manual draft",()=>{
  const root=new URL("../../../",import.meta.url);
  const ui=fs.readFileSync(new URL(
    "ui/src/components/orders/ServiceVisitFeedbackPanel.tsx",root),"utf8");
  const panel=fs.readFileSync(new URL(
    "ui/src/components/orders/ServiceSiteVisitPanel.tsx",root),"utf8");
  const order=fs.readFileSync(new URL(
    "ui/src/components/orders/OrderList.tsx",root),"utf8");
  assert.match(ui,/recordServiceVisitFeedback\(/);
  assert.match(ui,/customerResponseConfirmed:confirm/);
  assert.match(ui,/shareConsent/);
  assert.match(ui,/buildManualServiceWhatsAppLink\(/);
  assert.match(ui,/parseGoogleReviewUrl\(reviewUrl\)/);
  assert.match(ui,/window\.open\(href/);
  assert.match(ui,/A review is entirely optional/);
  assert.match(panel,/<ServiceVisitFeedbackPanel visit=\{v\}/);
  assert.match(order,/customers=\{customers\}/);
});
