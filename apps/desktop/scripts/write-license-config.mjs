import fs from "node:fs";
import path from "node:path";

const value = String(process.env.MINARVA_LICENSE_PUBLIC_KEY_HEX || process.env.LICENSE_PUBLIC_KEY || "")
  .replace(/^0x/i, "")
  .replace(/\s/g, "")
  .toLowerCase();

if (value && !/^[0-9a-f]{64}$/.test(value)) {
  throw new Error("MINARVA_LICENSE_PUBLIC_KEY_HEX must be exactly 64 hexadecimal characters when provided.");
}

const output = path.resolve("apps/desktop/electron/license-config.ts");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(
  output,
  `// Generated during the desktop build. Never place a private signing key here.\nexport const BUNDLED_LICENSE_PUBLIC_KEY_HEX = ${JSON.stringify(value)};\n`,
  "utf8",
);
console.log(value ? "Bundled Minarva Biz license public key for desktop verification." : "No license public key supplied; desktop commercial-license verification will fail closed until configured.");
