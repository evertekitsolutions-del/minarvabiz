import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
for (const ext of [".ts", ".tsx"]) require.extensions[ext] = (module, file) => module._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText, file,
);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { rosterMonthCells, RosterMonthCalendar } =
  require("../../../ui/src/components/staff/RosterMonthCalendar.tsx");

assert.deepEqual(rosterMonthCells("2026-02").filter(Boolean).slice(-1), ["2026-02-28"]);
assert.equal(rosterMonthCells("2028-02").filter(Boolean).length, 29, "Leap February has 29 dates");
assert.equal(rosterMonthCells("2026-10")[0], null, "Monday-first October starts Thursday");
assert.equal(rosterMonthCells("2026-10")[3], "2026-10-01");
assert.equal(rosterMonthCells("2026-10").length % 7, 0);
assert.equal(rosterMonthCells("2026-13").length, 0, "Invalid months fail closed");
assert.equal(rosterMonthCells("0000-01").length, 0, "Invalid years fail closed");

const entries = [
  { id: "a", workDate: "2026-10-01", employee: "Employee <script>alert(1)</script>",
    shift: "Night", hours: "22:00–06:00 (+1 day)", branch: "West", version: 2 },
  { id: "b", workDate: "2026-10-01", employee: "Ada",
    shift: "Day", hours: "09:00–17:00", branch: "East", version: 1 },
  { id: "c", workDate: "2026-11-01", employee: "Out of month",
    shift: "Day", hours: "09:00–17:00", branch: "East", version: 1 },
];
const before = structuredClone(entries);
const html = renderToStaticMarkup(React.createElement(RosterMonthCalendar, { month: "2026-10", entries }));
assert.match(html, /Monthly roster 2026-10/);
assert.match(html, /dateTime="2026-10-01"/, "Browser calendar must preserve the exact branch-local day");
assert.match(html, /Night.*22:00|Night<\/span>/);
assert.match(html, /\(\+1 day\)/, "Overnight label must stay explicit");
assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, "Employee text is HTML-escaped");
assert.doesNotMatch(html, /<script>/, "Untrusted names never create markup");
assert.doesNotMatch(html, /Out of month/, "Other months must be excluded");
assert.ok(html.indexOf("Ada") < html.indexOf("Employee &lt;script&gt;"),
  "Same-day assignments are sorted deterministically");
assert.deepEqual(entries, before, "Calendar display cannot mutate authoritative roster data");
assert.match(html, /Read-only monthly roster calendar/);
assert.match(html, /Cancelled entries and revision actions remain available in List view/);
assert.match(renderToStaticMarkup(React.createElement(RosterMonthCalendar, { month: "2026-13", entries: [] })),
  /Select a valid planning month/);

const planner = fs.readFileSync("packages/ui/src/components/staff/RosterPlanner.tsx", "utf8");
const web = fs.readFileSync("apps/web/src/app/(app)/roster/page.tsx", "utf8");
const desktop = fs.readFileSync("apps/desktop/src/components/DesktopRosterPanel.tsx", "utf8");
assert.match(planner, /workforceRoster\.rosterRange\(visibleSlots, from, to/, "Calendar reuses domain-filtered scheduled slots");
assert.match(planner, /rosterView === "calendar" && <RosterMonthCalendar/, "Read-only month view is wired");
assert.match(planner, /rosterView === "list" && <div/, "Existing corrections stay in List view");
assert.match(planner, /downloadRosterCsv/, "CSV export remains unchanged");
assert.match(web, /<RosterPlanner/, "Web uses the shared component");
assert.match(desktop, /<RosterPlanner/, "Windows uses the same component");
assert.doesNotMatch(fs.readFileSync("packages/ui/src/components/staff/RosterMonthCalendar.tsx", "utf8"),
  /fetch\(|localStorage|onSave|onClick|supabase|phase6Store/, "Calendar has no independent write path");

console.log("Shared Web/Windows roster calendar SSR, date-only grid, XSS, reuse and read-only regression PASS");
