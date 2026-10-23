import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const queue = JSON.parse(fs.readFileSync("docs/DEVELOPMENT_TASK_QUEUE.json", "utf8"));
assert.equal(queue.schemaVersion, 1);
assert.equal(queue.repository, "evertekitsolutions-del/minarvabiz");
assert.ok(Number.isInteger(queue.fullMasterVisionEstimatedPercent));
assert.ok(queue.fullMasterVisionEstimatedPercent >= 0 && queue.fullMasterVisionEstimatedPercent <= 100);
assert.match(queue.progressBasis, /reviewed/i);
assert.ok(Array.isArray(queue.tasks) && queue.tasks.length >= 3);
const ids = new Set(), priorities = new Set();
for (const item of queue.tasks) {
  assert.match(item.id, /^[A-Z][A-Z0-9-]+$/);
  assert.ok(!ids.has(item.id) && !priorities.has(item.priority), "No duplicate task identity/priority");
  ids.add(item.id); priorities.add(item.priority);
  assert.ok(Number.isSafeInteger(item.priority) && item.priority > 0);
  assert.ok(["ready", "in_progress", "blocked", "verified"].includes(item.status));
  assert.ok(item.title.length > 12 && item.nextAction.length > 25);
  assert.ok(item.acceptance.length >= 2 && item.references.length >= 1);
}
assert.ok(queue.tasks.some(item => item.status === "ready" || item.status === "in_progress"),
  "Queue must include runnable work; actively developing the last ready task does not make the backlog empty");
const workflow = fs.readFileSync(".github/workflows/automated-ci-triage.yml", "utf8");
assert.match(workflow, /schedule:[\s\S]*?cron:/);
assert.match(workflow, /workflow_run:\s*\n\s+workflows:/);
assert.match(workflow, /github\.event\.workflow_run\.repository\.full_name == github\.repository/);
assert.match(workflow, /github\.event\.workflow_run\.event == 'push'/);
assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'main'/);
assert.match(workflow, /minarva-continuity-main/);
assert.match(workflow, /issues:\s+write/);
assert.doesNotMatch(workflow, /actions\/checkout@|pull_request_target:|workflow_dispatch:/);
assert.doesNotMatch(workflow, /gh pr merge|gh release create|git push|gh workflow run/);
const marker = "      - name: Refresh one durable issue using GitHub API only\n        shell: bash\n        run: |\n";
assert.equal(workflow.split(marker).length, 2);
const bash = workflow.split(marker)[1].split("\n").map(line => {
  if (!line) return "";
  assert.ok(line.startsWith("          "), "Updater must remain a YAML run block");
  return line.slice(10);
}).join("\n");
const syntax = spawnSync("bash", ["-n"], { input: bash, encoding: "utf8" });
assert.equal(syntax.status, 0, syntax.stderr);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minarva-continuity-"));
try {
  const issuePath = path.join(dir, "issue.json");
  const statsPath = path.join(dir, "stats.json");
  const executable = path.join(dir, "gh");
  const lines = [
    "#!/usr/bin/env node",
    "const fs = require('node:fs');",
    "const args = process.argv.slice(2);",
    "const issueFile = process.env.MOCK_ISSUE;",
    "const statsFile = process.env.MOCK_STATS;",
    "const stats = fs.existsSync(statsFile) ? JSON.parse(fs.readFileSync(statsFile,'utf8')) : {creates:0,edits:0};",
    "let issue = fs.existsSync(issueFile) ? JSON.parse(fs.readFileSync(issueFile,'utf8')) : null;",
    "const out = x => process.stdout.write(typeof x === 'string' ? x : JSON.stringify(x));",
    "if(args[0]==='api'){",
    " const ep=args[1];",
    " if(ep.includes('/branches/main'))out('916cdd4c1cf1ea799bb1f46a14ff5fc789e8bbde');",
    " else if(ep.includes('/contents/docs/DEVELOPMENT_TASK_QUEUE.json'))out(Buffer.from(fs.readFileSync('docs/DEVELOPMENT_TASK_QUEUE.json')).toString('base64'));",
    " else if(ep.includes('/contents/docs/PRODUCT_DELIVERY_BACKLOG.json'))out(Buffer.from(fs.readFileSync('docs/PRODUCT_DELIVERY_BACKLOG.json')).toString('base64'));",
    " else if(ep.includes('/check-runs'))out({check_runs:[{conclusion:process.env.MOCK_FAIL==='1'?'failure':'success'}, {conclusion:process.env.MOCK_PENDING==='1'?null:'skipped'}]});",
    " else throw Error('Unexpected API ' + ep);",
    "}else if(args[0]==='pr' && args[1]==='list')out('');",
    "else if(args[0]==='release' && args[1]==='view')out('v1.0.15');",
    "else if(args[0]==='issue' && args[1]==='list')out(issue?[issue]:[]);",
    "else if(args[0]==='issue' && args[1]==='create'){",
    " stats.creates++; issue={number:7,title:args[args.indexOf('--title')+1],state:'OPEN',body:args[args.indexOf('--body')+1]};",
    " fs.writeFileSync(issueFile,JSON.stringify(issue));out('https://github.com/example/issues/7');",
    "}else if(args[0]==='issue' && args[1]==='edit'){",
    " stats.edits++;if(!issue)throw Error('No issue');issue.body=args[args.indexOf('--body')+1];",
    " fs.writeFileSync(issueFile,JSON.stringify(issue));out('edited');",
    "}else throw Error('Unexpected gh '+args.join(' '));",
    "fs.writeFileSync(statsFile,JSON.stringify(stats));",
  ];
  fs.writeFileSync(executable, lines.join("\n") + "\n", { mode: 0o755 });
  const env = { ...process.env, PATH: dir + ":" + process.env.PATH,
    GH_TOKEN:"test-only",GH_REPO:"evertekitsolutions-del/minarvabiz",
    MOCK_ISSUE:issuePath,MOCK_STATS:statsPath };
  const run = (overrides={}) => {
    const result=spawnSync("bash",["-c",bash],{cwd:process.cwd(),env:{...env,...overrides},encoding:"utf8",timeout:20000});
    assert.equal(result.status,0,result.stderr+"\n"+result.stdout);
    return JSON.parse(fs.readFileSync(issuePath,"utf8"));
  };
  let issue=run();
  assert.equal(issue.title,"Minarva Biz — Development Continuity Dashboard");
  assert.match(issue.body,/HR-004C-REVIEW-LIFECYCLE/);
  assert.match(issue.body,/## Next customer-visible delivery outcome/);
  assert.match(issue.body,/A-CORE-PARITY/);
  assert.match(issue.body,/docs\/OWNER_DIRECTIVE_2026-10-20\.md/);
  assert.match(issue.body,/optional hardening belongs to Phase H/);
  assert.match(issue.body,/## Commercial delivery priorities/);
  assert.match(issue.body,/## Technical subqueue/);
  assert.match(issue.body,/916cdd4c1cf1ea799bb1f46a14ff5fc789e8bbde/);
  assert.match(issue.body,/~51%/);
  assert.match(issue.body,/NOT an autonomous coding agent/);
  issue=run({MOCK_FAIL:"1",MOCK_PENDING:"1"});
  assert.match(issue.body,/FAILED: inspect logs/);
  assert.match(issue.body,/1 failed\/cancelled, 1 pending/);
  assert.deepEqual(JSON.parse(fs.readFileSync(statsPath,"utf8")),{creates:1,edits:1});
  issue.state="CLOSED";fs.writeFileSync(issuePath,JSON.stringify(issue));
  run();
  assert.deepEqual(JSON.parse(fs.readFileSync(statsPath,"utf8")),{creates:1,edits:1},"Closed dashboard cannot be recreated or reopened");
} finally {
  fs.rmSync(dir,{recursive:true,force:true});
}
console.log("Development continuity queue, no-checkout privileged updater, retry and idempotent dashboard PASS");
