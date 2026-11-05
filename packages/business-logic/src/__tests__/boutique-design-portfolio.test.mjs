import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,file);
const designs=require("../boutique-design-portfolio.ts");
const core=require("../store.ts");
const phase9=require("../phase9-store.ts");
const permissions=require("../permissions.ts");
const date="2026-11-05T08:00:00.000Z";
const branches=[
  {id:"branch-hq",name:"Headquarters",isActive:true,isHeadquarters:true,createdAt:date,updatedAt:date},
  {id:"branch-two",name:"Other",isActive:true,isHeadquarters:false,createdAt:date,updatedAt:date},
];
const jpg="data:image/jpeg;base64,"+"AAAA".repeat(50);
function reset(){
  permissions.setCurrentRole("admin");permissions.setRuntimeFeaturePolicy(null);
  phase9.hydratePhase9({branches,activeBranchId:"branch-hq"});
  core.hydrateCore({customers:[
    {id:"c1",name:"Customer 1",branchId:"branch-hq",outstandingBalance:0,totalSpending:0,createdAt:date,updatedAt:date},
    {id:"c2",name:"Customer 2",branchId:"branch-two",outstandingBalance:0,totalSpending:0,createdAt:date,updatedAt:date},
  ],products:[],sales:[],payments:[]});
  designs.hydrateBoutiqueDesignPortfolio([]);
}
const create=(customerId="c1",name="Wedding Blouse")=>({
  customerId,name,category:"Wedding",tags:["wedding","blouse"],referenceUrl:jpg,notes:"Golden embroidery",
});
test("reuses draft/approval/versioning workflow with real local customer reference",()=>{
  reset();
  const initial=designs.addBoutiqueDesign(create());
  assert.equal(initial.status,"draft");
  assert.equal(initial.version,1);
  assert.equal(initial.branchId,"branch-hq");
  assert.equal(initial.referenceUrl,jpg);
  assert.equal(designs.listBoutiqueDesigns("c1","golden").length,1);
  assert.equal(designs.submitBoutiqueDesignForApproval(initial.id).status,"pending_approval");
  assert.equal(designs.decideBoutiqueDesign(initial.id,true).status,"approved");
  assert.equal(designs.listBoutiqueDesigns("c1")[0].version,3);
  assert.throws(()=>designs.decideBoutiqueDesign(initial.id,true),/not awaiting/i);
  const saved=designs.exportBoutiqueDesignPortfolio();
  designs.hydrateBoutiqueDesignPortfolio([]);
  assert.deepEqual(designs.listBoutiqueDesigns("c1"),[]);
  designs.hydrateBoutiqueDesignPortfolio(saved);
  assert.equal(designs.listBoutiqueDesigns("c1")[0].status,"approved");
  designs.archiveBoutiqueDesign(initial.id);
  assert.equal(designs.listBoutiqueDesigns("c1").length,0);
  assert.equal(designs.exportBoutiqueDesignPortfolio().length,1,"archived references remain in recoverable history");
});
test("branch 2 cannot see or mutate HQ customer references, backups retain both branches",()=>{
  reset();
  const hq=designs.addBoutiqueDesign(create());
  phase9.hydratePhase9({branches,activeBranchId:"branch-two"});
  assert.equal(designs.listBoutiqueDesigns("c1").length,0);
  assert.throws(()=>designs.submitBoutiqueDesignForApproval(hq.id),/not ready/i);
  assert.throws(()=>designs.addBoutiqueDesign(create("c1")) ,/active branch/i);
  const other=designs.addBoutiqueDesign(create("c2","Wedding Uniform"));
  assert.equal(other.branchId,"branch-two");
  assert.equal(designs.listBoutiqueDesigns("c2").length,1);
  assert.equal(designs.exportBoutiqueDesignPortfolio().length,2);
  phase9.hydratePhase9({branches,activeBranchId:"branch-hq"});
  assert.deepEqual(designs.listBoutiqueDesigns("c1").map(d=>d.id),[hq.id]);
});
test("snapshot rejects corrupt photos, scripts, duplicates and unexpected oversized input",()=>{
  reset();
  const first=designs.addBoutiqueDesign(create());
  const before=JSON.stringify(designs.exportBoutiqueDesignPortfolio());
  for(const ref of [
    "javascript:alert(1)","data:image/svg+xml;base64,PHN2Zz4=",
    "http://no-tls.invalid/design.png","data:image/jpeg;base64,"+"AAAA".repeat(80000),
  ])assert.throws(()=>designs.addBoutiqueDesign({...create(),referenceUrl:ref}),/invalid/i);
  assert.equal(JSON.stringify(designs.exportBoutiqueDesignPortfolio()),before);
  assert.throws(()=>designs.validateBoutiqueDesignPortfolio([first,first]),/duplicate/i);
  assert.throws(()=>designs.validateBoutiqueDesignPortfolio([{...first,tags:[""]}]),/invalid/i);
  assert.throws(()=>designs.validateBoutiqueDesignPortfolio([{...first,referenceUrl:"file:///etc/passwd"}]),/invalid/i);
});
test("write permission enforced and local image gallery wired to CRM and offline backups",()=>{
  reset();
  permissions.setCurrentRole(null);
  assert.throws(()=>designs.addBoutiqueDesign(create()),/permission denied/i);
  permissions.setCurrentRole("admin");
  const crm=fs.readFileSync(new URL("../../../ui/src/components/crm/CustomerProfile.tsx",import.meta.url),"utf8");
  const ui=fs.readFileSync(new URL("../../../ui/src/components/crm/BoutiquePortfolioPanel.tsx",import.meta.url),"utf8");
  const persist=fs.readFileSync(new URL("../persistence.ts",import.meta.url),"utf8");
  assert.match(crm,/BoutiquePortfolioPanel customerId=\{customer\.id\}/);
  assert.match(ui,/createImageBitmap/);
  assert.match(ui,/canvas\.toDataURL/);
  assert.match(ui,/no cloud uploads/i);
  assert.match(persist,/boutiqueDesignPortfolio: boutiquePortfolio\.exportBoutiqueDesignPortfolio/);
  assert.match(persist,/validateBoutiqueDesignPortfolio/);
  assert.match(persist,/hydrateBoutiqueDesignPortfolio/);
});
