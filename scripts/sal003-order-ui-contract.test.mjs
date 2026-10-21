import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("shared SAL-003 UI is opt-in, with no live writer imported",()=>{
  const source=fs.readFileSync("packages/ui/src/components/sales/SalesOrderWorkspace.tsx","utf8");
  const barrel=fs.readFileSync("packages/ui/src/index.ts","utf8");
  assert.match(barrel,/components\/sales\/SalesOrderWorkspace/);
  for (const piece of ["enabled = false","if (!active)","onCreateDraft","onTransition",
    "Create draft","Confirm","Cancel","order.totalMinor","order.lines","Search sales orders"]) {
    assert.ok(source.includes(piece),piece);
  }
  assert.doesNotMatch(source,/remoteCreateSale|enqueueOutbox|createSale\(|fetch\(|supabase\.from/);
});
