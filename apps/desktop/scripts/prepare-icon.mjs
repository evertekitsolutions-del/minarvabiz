import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, "..");
const source = path.resolve(desktopRoot, "../web/public/logo-mark.png");
const destination = path.resolve(desktopRoot, "build/icon.png");

if (!fs.existsSync(source)) {
  throw new Error(`Minarva Biz logo not found: ${source}`);
}

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);

const stat = fs.statSync(destination);
if (stat.size < 1024) {
  throw new Error(`Generated Windows icon source is unexpectedly small: ${stat.size} bytes`);
}

console.log(`Windows icon source prepared from ${source}`);
console.log(`Icon source: ${destination} (${stat.size} bytes)`);
