import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync(new URL("../../../../apps/desktop/electron/main.ts", import.meta.url), "utf8");
const settings = fs.readFileSync(new URL("../../ui/src/components/settings/SettingsPanel.tsx", import.meta.url), "utf8");

const printStart = main.indexOf("async function printHtmlDocument");
const trialStart = main.indexOf("type TrialRegistration", printStart);
assert.ok(printStart >= 0 && trialStart > printStart, "Electron printHtmlDocument must exist");
const printBlock = main.slice(printStart, trialStart);

assert.match(printBlock, /const printers = await win\.webContents\.getPrintersAsync\(\)/);
assert.match(printBlock, /printers\.some\(\(printer\) => printer\.name === deviceName\)/);
assert.match(printBlock, /Configured printer was not found/);
assert.ok(
  printBlock.indexOf("getPrintersAsync") < printBlock.indexOf("win.webContents.print"),
  "Configured printer must be verified before the direct print call"
);

assert.match(settings, /printHtml\?: \(input:/);
assert.match(settings, /async function testSelectedPrinter\(\)/);
assert.match(settings, /await api\.printHtml\(/);
assert.match(settings, /Test selected printer/);
assert.match(settings, /setPrintTestState\("error"\)/);
assert.match(settings, /setPrintTestState\("done"\)/);

console.log("Printer test/preflight contract tests passed");
