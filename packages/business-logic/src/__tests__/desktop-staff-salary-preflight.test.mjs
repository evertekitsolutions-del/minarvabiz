import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,filename)=>mod._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{
  fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,filename);
const {parseDesktopPurchaseMoney}=require("../../../../apps/desktop/src/lib/desktop-purchase-amount.ts");
const app=fs.readFileSync(new URL("../../../../apps/desktop/src/App.tsx",import.meta.url),"utf8");
test("Windows staff editor uses exact salary validation, never prefix parseFloat",()=>{
 const handler=app.match(/function handleSaveStaff\(\)\{[\s\S]*?\}\n  function saveSettings/);
 assert(handler,"Staff editor handler exists");
 assert.match(handler[0],/salary:parseDesktopPurchaseMoney\(staffForm\.salary,"Salary",true\)/);
 assert.doesNotMatch(handler[0],/parseFloat\(staffForm\.salary\)/);
 assert.equal(parseDesktopPurchaseMoney("15000.50","Salary",true),15000.5);
 assert.equal(parseDesktopPurchaseMoney("","Salary",true),0);
 for(const invalid of ["500abc","1e4","-1","1.234","Infinity","NaN","12,345"]){
  assert.throws(()=>parseDesktopPurchaseMoney(invalid,"Salary",true),/Salary/);
 }
});
