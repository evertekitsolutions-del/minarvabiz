import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const requiredWorkflowNames = Object.freeze([
  "CI",
  "Windows Deep Installed Smoke",
  "Windows Feature Click Smoke",
  "Final Release Audit",
  "Licensing Smoke",
  "Secret Scan",
  "Dependency Security",
  "SAST",
  "Coverage Ratchet",
  "Staging Security + Performance",
  "SBOM + Dependency License Policy",
  "License Admin Static Artifact",
]);

export function assessRuns(runs, expectedSha, required = requiredWorkflowNames) {
  const latest = new Map();
  for (const run of runs) {
    if (run.head_sha !== expectedSha) continue;
    const name = run.name;
    if (!required.includes(name)) continue;
    const previous = latest.get(name);
    if (!previous || Number(run.id) > Number(previous.id)) latest.set(name, run);
  }
  return required.flatMap((name) => {
    const run = latest.get(name);
    if (!run) return [name + ": no run for exact commit"];
    if (run.status !== "completed" || run.conclusion !== "success") {
      return [name + ": " + String(run.status) + "/" + String(run.conclusion)];
    }
    if (run.event !== "push") return [name + ": expected a main push run"];
    return [];
  });
}

export function assertSafePreviewConfig(config) {
  assert.equal(config.name, "minarvabiz-customer-web-preview", "Never deploy to another Worker");
  assert.equal(config.workers_dev, true, "Preview must use isolated workers.dev hostname");
  assert.equal(config.routes, undefined, "Preview must not claim production routes");
  assert.equal(config.route, undefined, "Preview must not claim a production route");
  assert.equal(config.d1_databases, undefined, "No new database");
  assert.equal(config.r2_buckets, undefined, "No new storage");
  assert.equal(config.vars, undefined, "No credentials in Wrangler config");
}

async function requestJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "minarva-preview-deploy-gate",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error("GitHub deployment authority check failed: HTTP " + response.status);
  return response.json();
}

export async function verifyPreviewAuthority(env = process.env) {
  const sha = String(env.MINARVA_PREVIEW_EXPECTED_SHA || "").toLowerCase();
  assert.match(sha, /^[a-f0-9]{40}$/, "Expected an exact 40-character commit");
  assert.equal(env.GITHUB_REPOSITORY, "evertekitsolutions-del/minarvabiz");
  assert.equal(env.GITHUB_REF, "refs/heads/main", "Preview deploy only from main");
  assert.ok(env.GH_TOKEN, "Actions read token missing");

  const wrangler = JSON.parse(readFileSync(
    new URL("../apps/web/wrangler.jsonc", import.meta.url), "utf8",
  ));
  assertSafePreviewConfig(wrangler);
  const repoApi = "https://api.github.com/repos/evertekitsolutions-del/minarvabiz";
  const current = await requestJson(repoApi + "/branches/main", env.GH_TOKEN);
  assert.equal(current.commit?.sha, sha, "Main moved since workflow started; refuse stale deploy");

  const collected = [];
  for (let page = 1; page <= 10; page++) {
    const url = new URL(repoApi + "/actions/runs");
    url.searchParams.set("head_sha", sha);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    const response = await requestJson(url, env.GH_TOKEN);
    const runs = response.workflow_runs;
    assert.ok(Array.isArray(runs), "GitHub workflow list missing");
    collected.push(...runs);
    if (collected.length >= response.total_count) break;
    assert.ok(page < 10, "Too many workflow runs to authenticate safely");
  }

  const failures = assessRuns(collected, sha);
  assert.deepEqual(failures, [], "Unverified exact-main checks: " + failures.join("; "));
  return sha;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyPreviewAuthority().then(
    (sha) => console.log("CLOUDFLARE_CUSTOMER_PREVIEW_GATE PASS:", sha),
    (error) => {
      console.error("CLOUDFLARE_CUSTOMER_PREVIEW_GATE FAIL:", error.message);
      process.exitCode = 1;
    },
  );
}
