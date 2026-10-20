import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  fileName:file,
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
}).outputText,file);
const {validateMoneyAmountInput}=require("../service-order-price-draft.ts");
const source=fs.readFileSync(new URL("../../../../apps/desktop/src/App.tsx",import.meta.url),"utf8");
const helperSource=fs.readFileSync(new URL("../../../../apps/desktop/src/lib/desktop-purchase-amount.ts",import.meta.url),"utf8");
assert.match(source,/import \{ parseDesktopPurchaseMoney \} from "\.\/lib\/desktop-purchase-amount";/);
const helper=helperSource.match(/function parseDesktopPurchaseMoney\(raw: string, label: string, optional = false\): number \{([\s\S]*?)\n\}/);
assert.ok(helper,"desktop purchase preflight must remain present");
const parse=new Function("validateMoneyAmountInput","raw","label","optional",helper[1]).bind(null,validateMoneyAmountInput);
const match=source.match(/function handleCreatePurchase\(\)\{([\s\S]*?)\n  function resetStaffForm/);
assert.ok(match,"Windows purchase handler must remain present");
assert.doesNotMatch(match[1],/parseFloat\(purchaseForm\./);
function submit(changes={}) {
  const writes=[],errors=[];
  const defaults={date:"2026-10-20",supplierId:"supplier",description:"Real purchase",amount:"100.25",
    paidAmount:"20.25",paymentMethod:"cash",kind:"general",orderId:"",notes:""};
  const bindings={
    purchaseForm:{...defaults,...changes},
    parseDesktopPurchaseMoney:parse,
    phase5Store:{createPurchase(value){writes.push(value);return {purchase:{id:"p"},errors:[]};}},
    setModuleError(value){errors.push(value);},
    setPurchaseOpen(){},
    todayLocal(){return "2026-10-20";},
    setPurchaseForm(){},
    persistAndRefresh(){writes.push("persist");},
    errorMessage(error){return error.message;},
  };
  // Match includes the outer function close; execute only its handler body.
  new Function(...Object.keys(bindings),match[1].trimEnd().slice(0,-1))(...Object.values(bindings));
  return {writes,errors};
}
test("Windows preserves exact cents for valid purchases and optional zero payment",()=>{
  const valid=submit();
  assert.equal(valid.writes[0].amount,100.25);
  assert.equal(valid.writes[0].paidAmount,20.25);
  assert.equal(valid.writes[1],"persist");
  assert.equal(submit({paidAmount:""}).writes[0].paidAmount,0);
  assert.equal(submit({paidAmount:" .30 "}).writes[0].paidAmount,.3);
});
test("malformed amounts never enter purchase domain or persistence",()=>{
  for(const input of [{amount:""},{amount:"5abc"},{amount:"1e2"},{amount:"1.234"},
    {amount:"-1"},{amount:"NaN"},{amount:"999999999999999999999"},
    {paidAmount:"2bad"},{paidAmount:"-1"},{paidAmount:"1.234"},{paidAmount:"Infinity"}]) {
    const result=submit(input);
    assert.deepEqual(result.writes,[],JSON.stringify(input));
    assert.match(result.errors[0],/amount/i,JSON.stringify(input));
  }
});
test("purchase form preflight validates before creating records",()=>{
  assert.match(match[1],/amount:parseDesktopPurchaseMoney\(purchaseForm\.amount,"Purchase amount"\)/);
  assert.match(match[1],/paidAmount:parseDesktopPurchaseMoney\(purchaseForm\.paidAmount,"Paid amount",true\)/);
  assert.throws(()=>parse("","Purchase amount",false),/required/);
  assert.equal(parse("","Paid amount",true),0);
});
