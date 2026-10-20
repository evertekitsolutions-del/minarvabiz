import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
}).outputText,file);
const {validateMoneyAmountInput}=require("../service-order-price-draft.ts");
const source=fs.readFileSync(new URL("../../../../apps/desktop/src/App.tsx",import.meta.url),"utf8");
const helperSource=fs.readFileSync(new URL("../../../../apps/desktop/src/lib/desktop-purchase-amount.ts",import.meta.url),"utf8");
const helper=helperSource.match(/function parseDesktopPurchaseMoney\(raw: string, label: string, optional = false\): number \{([\s\S]*?)\n\}/);
assert.ok(helper);
const parse=new Function("validateMoneyAmountInput","raw","label","optional",helper[1]).bind(null,validateMoneyAmountInput);
const match=source.match(/function handleCreateExpense\(\)\{([\s\S]*?)\n  function handleReverseExpense/);
assert.ok(match,"real Windows expense handler must remain present");
assert.doesNotMatch(match[1],/parseFloat\(expenseForm\.amount\)/);
function submit(changes={}){
  const writes=[],errors=[];
  const input={date:"2026-10-20",categoryId:"ec-9",amount:"90.25",
    paymentMethod:"cash",description:"Office supplies",reference:"",receiptUrl:"",staffId:"",orderId:""};
  const bindings={
    expenseForm:{...input,...changes},parseDesktopPurchaseMoney:parse,
    phase5Store:{createExpense(value){writes.push(value);return {expense:{id:"expense"},errors:[]}}},
    setModuleError(value){errors.push(value)},
    setExpenseOpen(){},todayLocal(){return "2026-10-20";},
    setExpenseForm(){},persistAndRefresh(){writes.push("persist")},
    errorMessage(error){return error.message},
  };
  new Function(...Object.keys(bindings),match[1].trimEnd().slice(0,-1))(...Object.values(bindings));
  return {writes,errors};
}
test("exact expense amount persists unchanged",()=>{
  const r=submit();
  assert.equal(r.writes[0].amount,90.25);
  assert.equal(r.writes[1],"persist");
  assert.equal(submit({amount:".30"}).writes[0].amount,.3);
});
test("malformed expense amount cannot create expense or persist",()=>{
  for(const raw of ["","42bad","5.123","1e2","0x10","-1","Infinity","NaN","999999999999999999999","1 0"]){
    const result=submit({amount:raw});
    assert.deepEqual(result.writes,[],raw);
    assert.match(result.errors[0],/Expense amount/,raw);
  }
});
test("the live handler uses a strict shared validator rather than parseFloat",()=>{
  assert.match(match[1],/amount:parseDesktopPurchaseMoney\(expenseForm\.amount,"Expense amount"\)/);
  assert.match(source,/import \{ parseDesktopPurchaseMoney \} from "\.\/lib\/desktop-purchase-amount"/);
});
