import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

/**
 * Exercise the production publisher's real fetchJson function in a networkless VM.
 * The GitHub read token must NEVER be forwarded to the public Cloudflare Worker.
 */
const workflow = fs.readFileSync(".github/workflows/publish-windows-release.yml", "utf8");
const start = "          async function fetchJson(url) {";
const end = "          async function verifyOnce() {";
assert.ok(workflow.includes(start) && workflow.includes(end));
const source = "async function fetchJson(url) {" + workflow.split(start)[1].split(end)[0] +
  "\n fetchJson";
const releaseApi = "https://api.github.com/repos/evertekitsolutions-del/minarvabiz/releases/latest";
const workerApi = "https://minarva-biz-license-edge.minarva-biz.workers.dev/api/update/manifest";

function createFetchJson({token = "test-only-token",status = 200} = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({url, init});
    return {ok: status >= 200 && status < 300, status,
      json: async () => ({status: "ok"})};
  };
  const reader = vm.runInNewContext(source, {
    process: {env: {GH_TOKEN: token}}, releaseApi, fetch, Error,
  });
  return {reader, calls};
}

test("GitHub release request is authenticated but public worker stays token-free", async () => {
  const {reader, calls} = createFetchJson();
  await reader(workerApi);
  await reader(releaseApi);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.headers.authorization, undefined);
  assert.equal(calls[1].init.headers.authorization, "Bearer test-only-token");
  assert.equal(calls[1].init.headers["X-GitHub-Api-Version"], "2022-11-28");
  assert.equal(calls[0].init.cache, "no-store");
});

test("Missing GitHub token fails closed; does not make unauthenticated request", async () => {
  const {reader, calls} = createFetchJson({token: ""});
  await assert.rejects(reader(releaseApi), /Missing GitHub Actions token/);
  assert.equal(calls.length, 0);
});

test("GitHub 403 is fatal, to avoid thirty futile unauthenticated retries", async () => {
  const {reader, calls} = createFetchJson({status: 403});
  await assert.rejects(reader(releaseApi), error => error.fatal === true && /HTTP 403/.test(error.message));
  assert.equal(calls.length, 1);
});

test("Workflow passes ephemeral Actions token only to verification step", () => {
  assert.match(workflow, /Verify production signed update channel\n\s+env:\n[\s\S]*?GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(workflow, /if \(url === releaseApi\)/);
  assert.doesNotMatch(workflow, /pull_request_target:/);
});
