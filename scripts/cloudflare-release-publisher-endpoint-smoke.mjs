import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";

const base = "https://minarva-biz-license-edge.minarva-biz.workers.dev";
async function read(path) {
  const response = await fetch(base + path, {
    headers: { accept: "application/json", "user-agent": "MinarvaBiz-Publisher-Parity-Smoke" },
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

const { response: manifestResponse, data: manifest } = await read("/api/update/manifest");
console.log("Windows publisher manifest", JSON.stringify({
  status: manifestResponse.status,
  stage: manifest.stage || "ok",
  upstreamStatus: manifest.status || null,
  version: manifest.version || null,
}));
assert.equal(manifestResponse.status, 200, "workers.dev manifest endpoint must be healthy");
assert.equal(manifest.version, "1.0.26", "Customer installer release must be v1.0.26");
assert.equal(manifest.sha256, "a63a8ef01ec265e25d5ac0634a6d0596552987bb5ceb34a98e9dd9b84f8d0834");

const { response: keyResponse, data: keyData } = await read("/api/public-key");
assert.equal(keyResponse.status, 200, "workers.dev public key must be healthy");
assert.match(String(keyData.publicKeyHex), /^[0-9a-f]{64}$/);
const publicKey = createPublicKey({
  key: Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    Buffer.from(keyData.publicKeyHex, "hex"),
  ]),
  format: "der",
  type: "spki",
});
const payload = [
  "minarvabiz-update-v1",
  manifest.product,
  manifest.version,
  manifest.installerUrl,
  manifest.sha256,
  manifest.publishedAt,
].join("\n");
assert.ok(
  verify(null, Buffer.from(payload, "utf8"), publicKey, Buffer.from(manifest.signature, "base64url")),
  "Production Ed25519 signature must verify",
);
console.log("WINDOWS_PUBLISHER_UPDATE_ENDPOINT PASS v1.0.26");
