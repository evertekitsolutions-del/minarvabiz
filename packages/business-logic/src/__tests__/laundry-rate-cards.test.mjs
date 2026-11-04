import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,file);
const cards=require("../laundry-rate-cards.ts");
const permissions=require("../permissions.ts");
permissions.setCurrentRole("admin");permissions.setRuntimeFeaturePolicy(null);
const input={
  mode:"outsourced",serviceCode:"dry_clean",garment:"Suit",fabric:"wool",
  customerRate:250,supplierRate:150,tatHours:72,
};
test("all six services, controlled garment/fabric rate save and read-only quote lookup",()=>{
  cards.hydrateLaundryRateCards([]);
  assert.equal(cards.LAUNDRY_SERVICES.length,6);
  const created=cards.saveLaundryRateCard(input);
  assert.equal(cards.listLaundryRateCards().length,1);
  assert.equal(cards.findLaundryRateCard({...input,garment:"sUiT"})?.customerRate,250);
  const updated=cards.saveLaundryRateCard({...input,customerRate:275});
  assert.equal(updated.id,created.id);
  assert.equal(cards.listLaundryRateCards().length,1);
  assert.equal(cards.listLaundryRateCards()[0].customerRate,275);
});
test("malformed rates, duplicates, in-house supplier charges and excessive TAT fail atomically",()=>{
  const before=JSON.stringify(cards.exportLaundryRateCards());
  for(const rate of [
    {...input,serviceCode:"bad"}, {...input,customerRate:NaN},
    {...input,tatHours:0}, {...input,customerRate:-5},
    {...input,mode:"in_house_ironing",supplierRate:2},
  ]) assert.throws(()=>cards.saveLaundryRateCard(rate));
  assert.equal(JSON.stringify(cards.exportLaundryRateCards()),before);
  assert.throws(()=>cards.validateLaundryRateCards([...cards.exportLaundryRateCards(),...cards.exportLaundryRateCards()]),/duplicate/i);
});
test("offline snapshot round-trip and non-admin writes stay protected",()=>{
  const snapshot=cards.exportLaundryRateCards();
  cards.hydrateLaundryRateCards([]);
  assert.equal(cards.listLaundryRateCards().length,0);
  cards.hydrateLaundryRateCards(snapshot);
  assert.deepEqual(cards.exportLaundryRateCards(),snapshot);
  permissions.setCurrentRole("tailor");
  assert.throws(()=>cards.saveLaundryRateCard(input),/permission denied/i);
  permissions.setCurrentRole("admin");
});
test("Windows/Web rate card and snapshot UI are wired to existing primitives",()=>{
  const ui=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryForm.tsx",import.meta.url),"utf8");
  const persistence=fs.readFileSync(new URL("../persistence.ts",import.meta.url),"utf8");
  assert.match(ui,/LAUNDRY_SERVICES/);
  assert.match(ui,/Apply saved garment rate/);
  assert.match(ui,/Save rate to catalog/);
  assert.match(persistence,/laundryRateCards: laundryRates\.exportLaundryRateCards/);
  assert.match(persistence,/hydrateLaundryRateCards/);
});
