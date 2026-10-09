import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(module,filename)=>module._compile(ts.transpileModule(
  fs.readFileSync(filename,"utf8"),{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
  }}).outputText,filename);
const {buildRosterCsv}=require("../workforce-roster-export.ts");
const staff=[{id:"1",name:" =SUM(1,2)"},{id:"2",name:'Anil "Test"\nName'}];
const shifts=[{id:"day",name:"+EXEC",startTime:"09:00",endTime:"17:00",unpaidBreakMinutes:30}];
const branches=[{id:"b",name:"@Branch, HQ"}];
const slots=[
{id:"b",staffId:"2",shiftRuleId:"absent",branchId:null,workDate:"2026-10-10",status:"cancelled",version:2},
{id:"a",staffId:"1",shiftRuleId:"day",branchId:"b",workDate:"2026-10-09",status:"scheduled",version:1}
];
const old=structuredClone(slots),csv=buildRosterCsv({slots,shifts,staff,branches});
const rows=csv.trimEnd().split("\r\n");
assert.equal(rows.length,3);
assert.match(rows[0],/^"Work date","Employee","Employee ID"/);
assert.match(rows[1],/^"2026-10-09","' =SUM\(1,2\)"/);
assert.match(rows[1],/"'\+EXEC"/);
assert.match(rows[1],/"'@Branch, HQ"/);
assert.match(rows[2],/"Anil ""Test"" Name"/);
assert.match(rows[2],/"Archived shift \(absent\)"/);
assert.match(rows[2],/"cancelled","2"$/);
assert.deepEqual(slots,old,"Export must not mutate shared roster state");
assert.equal(buildRosterCsv({slots:[],staff,shifts,branches}).split("\r\n").length,2);
const ui=fs.readFileSync("packages/ui/src/components/staff/RosterPlanner.tsx","utf8");
assert.match(ui,/Export visible roster CSV/);
assert.match(ui,/disabled=\{!monthValid \|\| visibleSlots.length === 0\}/);
assert.match(ui,/URL\.revokeObjectURL/);
assert.match(ui,/slots: visibleSlots/);
console.log("HR-004 monthly CSV: scoped rows, formula injection protection, quoting, read-only export PASS");
