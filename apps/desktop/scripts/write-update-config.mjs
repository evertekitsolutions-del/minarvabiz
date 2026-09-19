import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const manifestUrl = String(process.env.MINARVA_UPDATE_MANIFEST_URL || "").trim();
const publicKeyHex = String(process.env.MINARVA_UPDATE_PUBLIC_KEY_HEX || "")
  .replace(/^0x/i, "")
  .replace(/\s/g, "")
  .toLowerCase();

if ((manifestUrl && !publicKeyHex) || (!manifestUrl && publicKeyHex)) {
  throw new Error("Secure auto-update requires both MINARVA_UPDATE_MANIFEST_URL and MINARVA_UPDATE_PUBLIC_KEY_HEX.");
}
if (manifestUrl && !/^https:\/\//i.test(manifestUrl)) {
  throw new Error("MINARVA_UPDATE_MANIFEST_URL must use HTTPS.");
}
if (publicKeyHex && !/^[0-9a-f]{64}$/.test(publicKeyHex)) {
  throw new Error("MINARVA_UPDATE_PUBLIC_KEY_HEX must be exactly 64 hexadecimal characters.");
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(scriptDir, "../electron/update-config.ts");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(
  output,
  `// Generated during desktop build. Public verification material only.\nexport const BUNDLED_UPDATE_MANIFEST_URL = ${JSON.stringify(manifestUrl)};\nexport const BUNDLED_UPDATE_PUBLIC_KEY_HEX = ${JSON.stringify(publicKeyHex)};\n`,
  "utf8",
);
console.log(manifestUrl ? "Secure update channel configured." : "Secure update channel disabled (no manifest configured).");
