import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const writer = path.join(root, "apps", "desktop", "scripts", "write-license-config.mjs");
const output = path.join(root, "apps", "desktop", "electron", "license-config.ts");

function run(envOverrides) {
  const env = { ...process.env, ...envOverrides };
  const result = spawnSync(process.execPath, [writer], {
    cwd: root,
    env,
    encoding: "utf8",
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`PRODUCTION LICENSE CONFIG TEST FAILED: ${message}`);
}

const cleanEnv = {
  MINARVA_COMMERCIAL_RELEASE: "1",
};
delete cleanEnv.MINARVA_LICENSE_PUBLIC_KEY_HEX;
delete cleanEnv.LICENSE_PUBLIC_KEY;

let result = run({
  ...cleanEnv,
  MINARVA_LICENSE_PUBLIC_KEY_HEX: "",
  LICENSE_PUBLIC_KEY: "",
});
const missingOutput = `${result.stdout}\n${result.stderr}`;
assert(result.status !== 0, "Commercial release build unexpectedly succeeded without a public verification key.");
assert(
  missingOutput.includes("Commercial release build requires MINARVA_LICENSE_PUBLIC_KEY_HEX or LICENSE_PUBLIC_KEY"),
  "Missing-key failure did not come from the commercial-release fallback refusal guard.",
);
console.log("MISSING_KEY_REFUSAL PASS: commercial release refuses the repository fallback key.");

result = run({
  ...cleanEnv,
  MINARVA_LICENSE_PUBLIC_KEY_HEX: "a".repeat(63),
  LICENSE_PUBLIC_KEY: "",
});
const invalidOutput = `${result.stdout}\n${result.stderr}`;
assert(result.status !== 0, "Commercial release build unexpectedly accepted a 63-character verification key.");
assert(
  invalidOutput.includes("must be exactly 64 hexadecimal characters"),
  "Invalid-key failure did not enforce the 64-hex public-key contract.",
);
console.log("INVALID_KEY_REFUSAL PASS: commercial release rejects an invalid public verification key.");

const validKey = "ab".repeat(32);
try {
  result = run({
    ...cleanEnv,
    MINARVA_LICENSE_PUBLIC_KEY_HEX: validKey,
    LICENSE_PUBLIC_KEY: "",
  });
  assert(result.status === 0, `Valid production public key should succeed; exit=${result.status}.`);
  assert(fs.existsSync(output), "License config output was not generated for the valid key.");
  const generated = fs.readFileSync(output, "utf8");
  assert(generated.includes(validKey), "Generated license config does not contain the supplied public verification key.");
  assert(!/PRIVATE_KEY|LICENSE_PRIVATE_KEY|BEGIN PRIVATE KEY|privateKey/.test(generated), "Generated license config contains private-key material.");
  console.log("VALID_KEY_BUNDLE PASS: supplied public verification key was bundled without private-key material.");
} finally {
  try {
    fs.rmSync(output, { force: true });
  } catch {}
}

console.log("PRODUCTION_LICENSE_CONFIG_REGRESSION PASS");
