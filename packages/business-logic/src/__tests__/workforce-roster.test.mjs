import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename,
);
const { validateShiftRule, checkRosterSlot, rosterRange } = require("../workforce-roster.ts");

const activeStaff = { id: "staff-1", status: "active", branchId: "branch-1" };
const day = { id: "day", name: "Day shift", startTime: "09:00", endTime: "17:00", unpaidBreakMinutes: 30, branchId: null, active: true };
const night = { id: "night", name: "Night shift", startTime: "22:00", endTime: "06:00", unpaidBreakMinutes: 45, branchId: "branch-1", active: true };
const split = { id: "split", name: "Split shift", startTime: "18:00", endTime: "23:00", unpaidBreakMinutes: 0, branchId: null, active: true };
const shifts = [day, night, split];
const first = { id: "r1", staffId: "staff-1", workDate: "2026-10-09", shiftRuleId: "night", branchId: "branch-1", status: "scheduled", version: 1 };
const option = (candidate, slots = [], staff = activeStaff, policy) => checkRosterSlot({ candidate, slots, shifts, staff, policy });
const denied = (response, pattern) => {
  assert.equal(response.ok, false, "An unsafe roster assignment must fail closed");
  assert.match(response.errors.join("; "), pattern);
};

assert.deepEqual(validateShiftRule(day), { spanMinutes: 480, workedMinutes: 450, overnight: false });
assert.deepEqual(validateShiftRule(night), { spanMinutes: 480, workedMinutes: 435, overnight: true });
const fullDay = { ...day, id: "full-day", startTime: "10:00", endTime: "10:00", unpaidBreakMinutes: 60 };
assert.deepEqual(validateShiftRule(fullDay), { spanMinutes: 1440, workedMinutes: 1380, overnight: true });
for (const invalid of [
  { ...day, startTime: "24:00" },
  { ...day, endTime: "08:70" },
  { ...day, unpaidBreakMinutes: -1 },
  { ...day, unpaidBreakMinutes: 0.5 },
  { ...day, unpaidBreakMinutes: 480 },
  { ...day, name: " " },
  { ...day, branchId: "" },
]) assert.throws(() => validateShiftRule(invalid));
assert.equal(option(first).ok, true);
assert.equal(option({ ...first, id: "r2", shiftRuleId: "day" }).ok, true, "Organization-wide rule is reusable in a branch");

const nextDayMorning = { ...first, id: "r2", workDate: "2026-10-10", shiftRuleId: "day" };
denied(option(nextDayMorning, [first]), /overlaps/);
const nextDayEvening = { ...first, id: "r3", workDate: "2026-10-10", shiftRuleId: "split" };
denied(option(nextDayEvening, [first], activeStaff, { minimumRestMinutes: 780 }), /Minimum rest/);
assert.equal(option(nextDayEvening, [first], activeStaff, { minimumRestMinutes: 600 }).ok, true);
assert.equal(option(nextDayEvening, [first], activeStaff, { minimumRestMinutes: 0 }).ok, true);

denied(option({ ...first, branchId: "branch-2" }), /branch/);
denied(option({ ...first, shiftRuleId: "missing" }), /unavailable/);
denied(option({ ...first, workDate: "2026-02-30" }), /real YYYY-MM-DD/);
denied(option({ ...first, workDate: "2026-13-01" }), /real YYYY-MM-DD/);
denied(option({ ...first, version: 2 }), /version/);
denied(option({ ...first, status: "approved" }), /status/);
denied(option(first, [], null), /unavailable/);
denied(option(first, [], { ...activeStaff, status: "inactive" }), /Only active/);
denied(option(first, [], { ...activeStaff, deletedAt: "2026-10-08T12:00:00Z" }), /archived/);
denied(option(first, [], activeStaff, { minimumRestMinutes: -1 }), /Minimum rest/);

const correction = { ...first, version: 2, status: "cancelled" };
assert.equal(option(correction, [first], { ...activeStaff, branchId: "branch-2" }).ok, true,
  "Historic shifts can be corrected after a branch transfer");
denied(option({ ...correction, version: 1 }, [first]), /Stale/);
denied(option({ ...correction, workDate: "2026-10-10" }, [first]), /immutable/);
denied(option({ ...correction, staffId: "staff-2" }, [first]), /immutable|unavailable/);
const cancelled = { ...first, status: "cancelled" };
assert.equal(option(nextDayMorning, [cancelled]).ok, true, "Cancelled shifts do not block new schedules");

const original = [nextDayEvening, { ...first, id: "r0", status: "cancelled" }, first];
const subset = rosterRange(original, "2026-10-09", "2026-10-10", "staff-1");
assert.deepEqual(subset.map(x => x.id), ["r1", "r3"]);
subset[0].status = "cancelled";
assert.equal(original[2].status, "scheduled", "Read-only previews never mutate stored slots");
assert.throws(() => rosterRange(original, "2026-10-10", "2026-10-09"), /ordered/);
console.log("HR shift/roster core validation, overnight overlap, rest, branches, revisions and read-only previews PASS");
