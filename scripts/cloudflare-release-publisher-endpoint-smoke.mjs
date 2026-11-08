import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";

const worker = "https://minarva-biz-license-edge.minarva-biz.workers.dev";
const releaseApi = "https://api.github.com/repos/evertekitsolutions-del/minarvabiz/releases/latest";
const releaseBase = "https://github.com/evertekitsolutions-del/minarvabiz/releases/download";

async function read(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "MinarvaBiz-Publisher-Parity-Smoke",
    },
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

const { response: manifestResponse, data: manifest } = await read(worker + "/api/update/manifest");
console.log("Windows publisher manifest", JSON.stringify({
  status: manifestResponse.status,
  stage: manifest.stage || "ok",
  version: manifest.version || null,
}));
assert.equal(manifestResponse.status, 200, "Production signed update endpoint must be healthy");
assert.equal(manifest.product, "minarvabiz");
assert.match(String(manifest.version), /^\d+\.\d+\.\d+$/);
assert.match(String(manifest.sha256), /^[0-9a-f]{64}$/);

const { response: releaseResponse, data: release } = await read(releaseApi);
assert.equal(releaseResponse.status, 200, "Cannot attest latest published GitHub installer digest");
const version = /^v(\d+\.\d+\.\d+)$/.exec(String(release.tag_name))?.[1];
assert.ok(version && release.draft === false && release.prerelease === false,
  "Only a published stable release may be advertised to customers");
const installerName = "MinarvaBiz-Setup-" + version + ".exe";
const installerUrl = releaseBase + "/v" + version + "/" + installerName;
const assets = Array.isArray(release.assets) ? release.assets : [];
const installer = assets.find((item) => item.name === installerName && item.state === "uploaded");
const checksum = assets.find((item) => item.name === installerName + ".sha256" && item.state === "uploaded");
assert.ok(installer && checksum && installer.size > 0, "Published installer and checksum must exist");
assert.equal(installer.browser_download_url, installerUrl);
assert.equal(checksum.browser_download_url, installerUrl + ".sha256");
const digest = /^sha256:([0-9a-f]{64})$/i.exec(String(installer.digest))?.[1]?.toLowerCase();
assert.ok(digest, "GitHub's uploaded asset SHA-256 digest is mandatory");
assert.equal(manifest.version, version, "Signed manifest must match latest published stable version");
assert.equal(manifest.installerUrl, installerUrl, "Signed installer path must be exact");
assert.equal(manifest.sha256, digest, "Signed digest must match GitHub's asset digest");
// The currently deployed legacy worker timestamps the checksum response, which
// can differ by seconds from GitHub's release publication timestamp. The new
// REST worker uses published_at exactly; permit a bounded transition only.
const manifestPublishedAt = Date.parse(String(manifest.publishedAt));
const releasePublishedAt = Date.parse(String(release.published_at));
assert.ok(Number.isFinite(manifestPublishedAt) && Number.isFinite(releasePublishedAt) &&
  Math.abs(manifestPublishedAt - releasePublishedAt) <= 300_000,
  "Signed release timestamp must be within five minutes of published release");

const { response: keyResponse, data: keyData } = await read(worker + "/api/public-key");
assert.equal(keyResponse.status, 200, "Production Ed25519 key must be available");
assert.match(String(keyData.publicKeyHex), /^[0-9a-f]{64}$/);
const publicKey = createPublicKey({
  key: Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    Buffer.from(keyData.publicKeyHex, "hex"),
  ]),
  format: "der",
  type: "spki",
});
const canonical = [
  "minarvabiz-update-v1",
  manifest.product,
  manifest.version,
  manifest.installerUrl,
  manifest.sha256,
  manifest.publishedAt,
].join("\n");
assert.ok(verify(
  null, Buffer.from(canonical, "utf8"), publicKey,
  Buffer.from(String(manifest.signature), "base64url"),
), "Production Ed25519 signature verification failed");
console.log("WINDOWS_PUBLISHER_UPDATE_ENDPOINT PASS version=" + version + " sha256=" + digest);
