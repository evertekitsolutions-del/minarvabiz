import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename,
);
const { claimPrimaryDesktopInstance } = require(
  "../../../../apps/desktop/electron/single-instance-owner.ts",
);
const mainSource = fs.readFileSync("apps/desktop/electron/main.ts", "utf8");

function scenario(lock, list = []) {
  const events = [];
  let second = null;
  const granted = claimPrimaryDesktopInstance(
    () => { events.push("request-lock"); if (lock === "throw") throw Error("OS denied"); return lock; },
    () => events.push("quit"),
    fn => { events.push("listen-second-instance"); second = fn; },
    () => list,
  );
  return { granted, events, second };
}

for (const refused of [false, undefined, "throw"]) {
  const rejected = scenario(refused);
  assert.equal(rejected.granted, false);
  assert.deepEqual(rejected.events, ["request-lock", "quit"],
    "Second process must not initialize, listen or access SQLite");
  assert.equal(rejected.second, null);
}
const normalEvents = [];
const win = {
  isDestroyed: () => false,
  isMinimized: () => false,
  restore: () => normalEvents.push("restore"),
  show: () => normalEvents.push("show"),
  focus: () => normalEvents.push("focus"),
};
const primary = scenario(true, [win]);
assert.equal(primary.granted, true);
assert.deepEqual(primary.events, ["request-lock", "listen-second-instance"]);
primary.second();
assert.deepEqual(normalEvents, ["show", "focus"],
  "Second instance must focus the already running desktop window");

const minimizedEvents = [];
const minimized = scenario(true, [{
  ...win,
  isMinimized: () => true,
  restore: () => minimizedEvents.push("restore"),
  show: () => minimizedEvents.push("show"),
  focus: () => minimizedEvents.push("focus"),
}]);
minimized.second();
assert.deepEqual(minimizedEvents, ["restore", "show", "focus"]);
const destroyedEvents = [];
const destroyed = scenario(true, [{
  ...win,
  isDestroyed: () => true,
  focus: () => destroyedEvents.push("wrong-window"),
}, win]);
destroyed.second();
assert.deepEqual(destroyedEvents, []);
assert.doesNotThrow(() => scenario(true, []).second(),
  "Second-instance signal before the owner creates its window is safe");
assert.doesNotThrow(() => scenario(true, [{
  ...win, focus: () => { throw Error("Window manager unavailable"); },
}]).second(), "Window manager errors cannot transfer database ownership");

// This is the actual integrated Electron main path, not a standalone mock
// claim which might accidentally leave real app bootstrapping unprotected.
assert.match(mainSource,
  /const isPrimaryDesktopInstance = claimPrimaryDesktopInstance\(\s*\(\) => app\.requestSingleInstanceLock\(\)/);
assert.match(mainSource,
  /if \(isPrimaryDesktopInstance\) app\.whenReady\(\)\.then\(/,
  "Unauthorized second process must not run whenReady bootstrap");
assert.match(mainSource, /app\.on\("second-instance", focusOwner\)/);
assert.match(mainSource, /sqliteGate\.write\(\(\) => \{\s*\/\/ The UI persists full images/,
  "Existing same-process transaction gate must stay enabled");
assert.match(mainSource, /sqliteGate\.reserve\("restore"/,
  "Existing async restore reservation must stay enabled");
assert.doesNotMatch(mainSource, /app\.requestSingleInstanceLock\(\)\s*\|\|\s*true/,
  "A denied single-instance lock may never be bypassed");
console.log("OFFLINE-NATIVE-03 Electron single-instance lock and focus boundary PASS");
