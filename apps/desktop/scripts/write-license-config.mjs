import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const productionPublicKey = "110016b7ca4899194a6f5408c0cc36271f67119bf1fa99e50eb9da90458e7ce7";
const value = String(process.env.MINARVA_LICENSE_PUBLIC_KEY_HEX || process.env.LICENSE_PUBLIC_KEY || productionPublicKey)
  .replace(/^0x/i, "")
  .replace(/\s/g, "")
  .toLowerCase();

if (!/^[0-9a-f]{64}$/.test(value)) {
  throw new Error("MINARVA_LICENSE_PUBLIC_KEY_HEX must be exactly 64 hexadecimal characters when provided.");
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(scriptDir, "../electron/license-config.ts");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(
  output,
  `// Generated during the desktop build. Never place a private signing key here.\nexport const BUNDLED_LICENSE_PUBLIC_KEY_HEX = ${JSON.stringify(value)};\n`,
  "utf8",
);
console.log("Bundled Minarva Biz license public key for desktop verification.");
