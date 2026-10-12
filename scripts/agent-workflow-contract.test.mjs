import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const content = fs.readFileSync(".github/workflows/minarva-source-agent.yml","utf8");
test("schedule is bounded and manual run is possible",()=>{
 assert.match(content,/cron: '13,43 \* \* \* \*'/);
 assert.match(content,/workflow_dispatch:/);
 assert.match(content,/cancel-in-progress: false/);
});
test("no unattended charge, repository write, merging or deployment",()=>{
 assert.match(content,/if: \$\{\{ needs\.preflight\.outputs\.eligible == 'true' && vars\.MINARVA_COPILOT_AUTOCODE_ENABLED == 'true' \}\}/);
 assert.match(content,/contents: read/);
 assert.match(content,/copilot-requests: write/);
 assert.doesNotMatch(content,/contents: write|pull-requests: write|gh pr merge|git push|gh release create|pull_request_target:/);
});
test("source patch is review-only and cannot invoke network or shell via model",()=>{
 assert.match(content,/--deny-tool='shell'/);
 assert.match(content,/--deny-tool='url'/);
 assert.match(content,/agent-patch-audit\.mjs/);
 assert.match(content,/minarva-reviewed-source-proposal/);
 assert.match(content,/persist-credentials: false/g);
});

test("scheduled agent checks entire product scope and cannot fake code-production state", () => {
 assert.match(content,/node scripts\/product-delivery-audit\.mjs/);
 const gate=fs.readFileSync("scripts/agent-queue-gate.mjs","utf8");
 assert.match(gate,/DISABLED_NO_CODING/);
 assert.match(gate,/BLOCKED_NO_CODING/);
 assert.match(gate,/REVIEW_PATCH_JOB_ELIGIBLE/);
 assert.match(gate,/execution_state=/);
 assert.match(gate,/codeGenerated: false/);
});
