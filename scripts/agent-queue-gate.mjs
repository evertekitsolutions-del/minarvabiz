import assert from "node:assert/strict";
import fs from "node:fs";

const REPOSITORY = "evertekitsolutions-del/minarvabiz";
const ALLOWED_SOURCE_TASKS = new Set(["HR-005-HOLIDAYS"]);
const SHA = /^[0-9a-f]{40}$/i;

/**
 * Deterministic, fail-closed scheduling decision. A concurrent PR always
 * wins over new AI work. Only explicitly reviewed source tasks are eligible.
 */
export function decideAgentRun({ queue, pulls, checkoutSha, mainSha, repo, ref }) {
  assert.equal(repo, REPOSITORY, "Unexpected repository identity");
  assert.equal(ref, "refs/heads/main", "Must run from main");
  assert.ok(SHA.test(checkoutSha) && SHA.test(mainSha), "Missing verified git SHA");
  assert.equal(queue?.schemaVersion, 1);
  assert.equal(queue?.repository, REPOSITORY);
  assert.ok(Array.isArray(queue.tasks));
  assert.ok(Array.isArray(pulls) && pulls.length < 100, "PR list truncated or unavailable");
  if (checkoutSha.toLowerCase() !== mainSha.toLowerCase())
    return {eligible: false, reason: "stale_checkout", taskId: ""};
  if (pulls.some(p => p?.state === "open" && p.base?.ref === "main"))
    return {eligible: false, reason: "finish_open_pr_first", taskId: ""};
  const tasks = queue.tasks
    .filter(t => ALLOWED_SOURCE_TASKS.has(t.id) && ["ready", "in_progress"].includes(t.status))
    .sort((a, b) => a.priority - b.priority);
  if (!tasks.length)
    return {eligible: false, reason: "no_approved_source_task", taskId: ""};
  const task = tasks[0];
  assert.match(task.id, /^[A-Z0-9-]{4,60}$/);
  return {eligible: true, reason: "source_only_ready", taskId: task.id};
}

/**
 * Distinguish a healthy read-only queue gate from a working coding agent.
 * This is intentionally independent of the eligibility decision.
 */
export function describeAgentExecution(decision, aiEnabled) {
  if (aiEnabled !== "true") return {
    state: "DISABLED_NO_CODING",
    codeGenerated: false,
    detail: "Coding is disabled: MINARVA_COPILOT_AUTOCODE_ENABLED is not true. Preflight success is NOT code output."
  };
  if (!decision.eligible) return {
    state: "BLOCKED_NO_CODING",
    codeGenerated: false,
    detail: "Coding gate blocked: " + decision.reason
  };
  return {
    state: "REVIEW_PATCH_JOB_ELIGIBLE",
    codeGenerated: false,
    detail: "A review-only source patch job may start. No code, PR, merge or release can be claimed until separately verified."
  };
}

async function github(path, token) {
  const result = await fetch("https://api.github.com/repos/" + REPOSITORY + "/" + path, {
    headers: {Accept: "application/vnd.github+json", Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "minarva-autocode-guard"},
    signal: AbortSignal.timeout(15000)
  });
  if (!result.ok) throw Error("GitHub preflight HTTP " + result.status);
  return result.json();
}

async function main() {
  const token = process.env.GH_TOKEN;
  if (!token) throw Error("GITHUB_TOKEN required for read-only preflight");
  const queue = JSON.parse(fs.readFileSync("docs/DEVELOPMENT_TASK_QUEUE.json", "utf8"));
  const [branch, pulls] = await Promise.all([
    github("branches/main", token), github("pulls?state=open&base=main&per_page=100", token)
  ]);
  const decision = decideAgentRun({queue, pulls, checkoutSha: process.env.GITHUB_SHA,
    mainSha: branch.commit.sha, repo: process.env.GITHUB_REPOSITORY, ref: process.env.GITHUB_REF});
  const execution = describeAgentExecution(decision, process.env.MINARVA_AI_ENABLED);
  const output = "eligible=" + decision.eligible + "\ntask_id=" + decision.taskId + "\nreason=" +
    decision.reason + "\nmain_sha=" + branch.commit.sha + "\nexecution_state=" + execution.state + "\n";
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, output);
  const summary = "### Minarva Biz agent guard\n\n- Main: " + branch.commit.sha +
    "\n- Decision: **" + decision.reason + "**\n- AI requested: **" +
    (process.env.MINARVA_AI_ENABLED === "true" ? "explicitly enabled" : "disabled by default") +
    "**\n- Selected source task: " + (decision.taskId || "none") +
    "\n- **Actual coding state: " + execution.state + "**\n- " + execution.detail +
    "\n- This preflight wrote no source code and incurred no AI inference charges.\n";
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log("MINARVA_AGENT_PREFLIGHT " + JSON.stringify({mainSha:branch.commit.sha,...decision,...execution}));
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  main().catch(e => {console.error("MINARVA_AGENT_PREFLIGHT_BLOCKED:", e.message); process.exitCode = 1;});
}
