import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");

const render = fs.readFileSync(path.join(root, "render.yaml"), "utf8");
assert.match(render, /plan:\s*0\.5c-512mb/);
assert.doesNotMatch(render, /plan:\s*free/);
assert.match(render, /healthCheckPath:\s*\/api\/health/);
assert.match(render, /- key: LICENSE_PRIVATE_KEY\s*\n\s*sync: false/);
assert.doesNotMatch(render, /- key: LICENSE_PRIVATE_KEY\s*\n\s*generateValue: true/);

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicDer = publicKey.export({ type: "spki", format: "der" });
const privateDer = privateKey.export({ type: "pkcs8", format: "der" });
const publicKeyHex = Buffer.from(publicDer).subarray(-32).toString("hex");
const privateKeyHex = Buffer.from(privateDer).subarray(-32).toString("hex");

assert.match(publicKeyHex, /^[0-9a-f]{64}$/);
assert.match(privateKeyHex, /^[0-9a-f]{64}$/);

const seed = Buffer.from(privateKeyHex, "hex");
const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex");
const reconstructedPrivate = createPrivateKey({
  key: Buffer.concat([pkcs8Prefix, seed]),
  format: "der",
  type: "pkcs8",
});
const reconstructedPublic = createPublicKey(reconstructedPrivate)
  .export({ format: "der", type: "spki" });
const reconstructedPublicHex = Buffer.from(reconstructedPublic).subarray(-32).toString("hex");

assert.equal(reconstructedPublicHex, publicKeyHex);

console.log("Render license key/compute contract tests passed");
