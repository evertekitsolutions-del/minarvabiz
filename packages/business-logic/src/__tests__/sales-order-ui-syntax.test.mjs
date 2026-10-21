import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
const filename=new URL("../../../ui/src/components/sales/SalesOrderWorkspace.tsx",import.meta.url);
test("SAL-003 JSX parses under TypeScript before costly Web/Electron/Cloudflare builds",()=>{
 const source=fs.readFileSync(filename,"utf8");
 const r=ts.transpileModule(source,{
  fileName:filename.pathname,reportDiagnostics:true,
  compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,
    target:ts.ScriptTarget.ES2022},
 });
 const errors=(r.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
 assert.deepEqual(errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[]);
 for(const required of ["Edit draft","Move to Trash","Restore draft","Print A4",
     "onAmendDraft","onExportOrders","onPrintOrder","onArchive","onRestore"]) {
   // Dynamic mapping renders A4 as a JSX expression; check identifier separately.
   if(required==="Print A4") assert.match(source,/Print\s*\{paper === "a4"/);
   else assert.ok(source.includes(required),required);
 }
 assert.ok(r.outputText.includes("SalesOrderWorkspace"));
});
