import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configured = String(process.env.MINARVA_LICENSE_PUBLIC_KEY_HEX || process.env.LICENSE_PUBLIC_KEY || "")
  .replace(/^0x/i, "")
  .replace(/\s/g, "")
  .toLowerCase();

const fallbackPublicKey = "110016b7ca4899194a6f5408c0cc36271f67119bf1fa99e50eb9da90458e7ce7";
const releaseBuild = String(process.env.MINARVA_COMMERCIAL_RELEASE || "") === "1";
const configuredApiUrl = String(process.env.VITE_LICENSE_API_URL || process.env.MINARVA_LICENSE_API_URL || "").trim().replace(/\/$/, "");
const bundledApiUrl = configuredApiUrl || "https://license-api.minarvabiz.com";
if (!/^https:\/\/[A-Za-z0-9.-]+(?::443)?$/.test(bundledApiUrl)) {
  throw new Error("Commercial license API URL must be an HTTPS origin.");
}
if (releaseBuild && !configuredApiUrl) {
  throw new Error("Commercial release requires an explicitly configured license API URL.");
}

const value = configured || fallbackPublicKey;

if (releaseBuild && !configured) {
  throw new Error("Commercial release build requires MINARVA_LICENSE_PUBLIC_KEY_HEX or LICENSE_PUBLIC_KEY. Refusing to bundle the repository fallback key.");
}
if (!/^[0-9a-f]{64}$/.test(value)) {
  throw new Error("MINARVA_LICENSE_PUBLIC_KEY_HEX must be exactly 64 hexadecimal characters when provided.");
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(scriptDir, "../electron/license-config.ts");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(
  output,
  `// Generated during the desktop build. Never place a private signing key here.\nexport const BUNDLED_LICENSE_PUBLIC_KEY_HEX = ${JSON.stringify(value)};\nexport const BUNDLED_LICENSE_API_URL = ${JSON.stringify(bundledApiUrl)};\n`,
  "utf8",
);
console.log(`Bundled Minarva Biz license public key for verification (${configured ? "configured" : "fallback/development"} key).`);
