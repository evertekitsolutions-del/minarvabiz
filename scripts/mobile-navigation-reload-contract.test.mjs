import assert from "node:assert/strict";
import fs from "node:fs";

const smoke = fs.readFileSync(new URL("./mobile-frontend-browser-smoke.mjs", import.meta.url), "utf8");
const mark = smoke.indexOf("window.__minarvaMobilePreReload = true; location.assign(");
const wait = smoke.indexOf('window.__minarvaMobilePreReload !== true &&');
const firstDomUse = smoke.indexOf('querySelectorAll("button").length');
assert.ok(mark > 0, "must mark the old page before initiating a full navigation");
assert.ok(wait > mark && firstDomUse > wait, "must wait for a fresh dashboard document before reading navigation buttons");
assert.match(smoke, /location\.pathname === "\\/dashboard" && window\.__minarvaMobilePreReload !== true/);
assert.match(smoke, /Timed out waiting for /, "failure must remain a hard timeout");
assert.match(smoke, /Emulation\.setDeviceMetricsOverride/, "real mobile browser test must stay enabled");
console.log("Mobile navigation browser readiness handshake contract PASS");
