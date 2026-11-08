import test from "node:test";
import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";
import worker from "../infra/cloudflare-license-edge/src/index.js";

const url = "https://api.github.com/repos/evertekitsolutions-del/minarvabiz/releases/latest";
const installerUrl = "https://github.com/evertekitsolutions-del/minarvabiz/releases/download/v1.0.25/MinarvaBiz-Setup-1.0.25.exe";
const checksumUrl = installerUrl + ".sha256";
const digest = "a".repeat(64);
const env = { LICENSE_EDGE_RPC_SECRET: "manifest-regression-deterministic-fake-secret-NEVER-PRODUCTION" };

function release(overrides = {}) {
  return {
    tag_name: "v1.0.25",
    draft: false,
    prerelease: false,
    published_at: "2026-11-05T12:56:01Z",
    assets: [
      { name: "MinarvaBiz-Setup-1.0.25.exe", state: "uploaded", size: 101791936,
        digest: "sha256:" + digest, browser_download_url: installerUrl },
      { name: "MinarvaBiz-Setup-1.0.25.exe.sha256", state: "uploaded", size: 93,
        browser_download_url: checksumUrl },
    ],
    ...overrides,
  };
}

async function invoke(response = release(), status = 200) {
  const oldFetch = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async (target) => {
      requests.push(String(target));
      assert.equal(String(target), url, "Must never download GitHub release binary/checksum");
      return new Response(JSON.stringify(response), { status, headers: { "content-type": "application/json" } });
    };
    const reply = await worker.fetch(new Request("https://worker.test/api/update/manifest"), env);
    return { status: reply.status, data: await reply.json(), requests, headers: reply.headers };
  } finally {
    globalThis.fetch = oldFetch;
  }
}

test("metadata-only release lookup signs exact published SHA-256 and version", async () => {
  const result = await invoke();
  assert.equal(result.status, 200);
  assert.deepEqual(result.requests, [url]);
  assert.equal(result.data.version, "1.0.25");
  assert.equal(result.data.installerUrl, installerUrl);
  assert.equal(result.data.sha256, digest);
  assert.equal(result.data.publishedAt, "2026-11-05T12:56:01Z");
  assert.equal(result.headers.get("x-minarva-update-source"), "github-release");

  const keyResponse = await worker.fetch(new Request("https://worker.test/api/public-key"), env);
  const { publicKeyHex } = await keyResponse.json();
  const publicKey = createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKeyHex, "hex")]),
    format: "der", type: "spki",
  });
  const canonical = [
    "minarvabiz-update-v1", "minarvabiz", "1.0.25", installerUrl, digest, result.data.publishedAt,
  ].join("\n");
  assert.ok(verify(null, Buffer.from(canonical), publicKey, Buffer.from(result.data.signature, "base64url")));
});

test("GitHub transient outages only serve previously SHA-256-verified signed releases", async () => {
  const healthy = await invoke(release());
  assert.equal(healthy.status, 200);
  for (const status of [403, 429, 502, 503, 504]) {
    const result = await invoke({ message: "unavailable" }, status);
    assert.equal(result.status, 200);
    assert.equal(result.data.sha256, healthy.data.sha256);
    assert.equal(result.data.installerUrl, healthy.data.installerUrl);
    assert.equal(result.data.signature, healthy.data.signature);
  }
  for (const status of [401, 404]) {
    const result = await invoke({ message: "not allowed" }, status);
    assert.equal(result.status, 503);
    assert.equal(result.data.stage, "latest-release");
  }
});

test("rejects untrusted or incomplete release metadata without signing", async () => {
  const scenarios = [
    release({ tag_name: "v1.0.25-rc1" }),
    release({ draft: true }),
    release({ prerelease: true }),
    release({ published_at: "invalid" }),
    release({ assets: [] }),
    release({ assets: release().assets.slice(0, 1) }),
    release({ assets: release().assets.map((x, i) => i === 0 ? { ...x, digest: null } : x) }),
    release({ assets: release().assets.map((x, i) => i === 0 ? { ...x, digest: "sha256:wrong" } : x) }),
    release({ assets: release().assets.map((x, i) => i === 0 ? { ...x, browser_download_url: "https://evil.test/installer.exe" } : x) }),
    release({ assets: release().assets.map((x, i) => i === 0 ? { ...x, size: 0 } : x) }),
    release({ assets: release().assets.map((x, i) => i === 1 ? { ...x, state: "starter" } : x) }),
  ];
  for (const scenario of scenarios) {
    const result = await invoke(scenario);
    assert.equal(result.status, 503, JSON.stringify(scenario));
    assert.equal(result.data.signature, undefined);
  }
});

test("without signing authority manifest fails closed before GitHub fetch", async () => {
  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error("Should not fetch"); };
    const response = await worker.fetch(new Request("https://worker.test/api/update/manifest"), {});
    assert.equal(response.status, 503);
    assert.equal((await response.json()).stage, "authority");
  } finally {
    globalThis.fetch = oldFetch;
  }
});
