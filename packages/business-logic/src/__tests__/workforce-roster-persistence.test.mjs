import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename,
);
const permissions = require("../permissions.ts");
const roster = require("../phase6-store.ts");
const persistence = require("../persistence.ts");
const outbox = require("../outbox-bridge.ts");
const audit = require("../phase7-store.ts");
permissions.setCurrentRole("admin");
roster.hydratePhase6({ shiftRules: [], rosterSlots: [] });

const day = roster.createShiftRule({
  name: "Production day", startTime: "09:00", endTime: "17:00",
  unpaidBreakMinutes: 30, branchId: null, active: true,
});
assert.equal(roster.listShiftRules().length, 1);
assert.throws(() => roster.createShiftRule({
  name: "production DAY", startTime: "09:00", endTime: "17:00",
  unpaidBreakMinutes: 30, branchId: null, active: true,
}), /already used/);
const scheduled = roster.assignRosterSlot({
  staffId: "staff-1", shiftRuleId: day.id, workDate: "2026-10-09",
  branchId: null, status: "scheduled",
});
assert.equal(scheduled.version, 1);
assert.equal(roster.listRosterSlots("2026-10-09", "2026-10-09").length, 1);
assert.throws(() => roster.assignRosterSlot({
  staffId: "staff-1", shiftRuleId: day.id, workDate: "2026-10-09",
  branchId: null, status: "scheduled",
}), /overlaps/);
assert.throws(() => roster.updateShiftRule(day.id, { startTime: "10:00" }), /Historical shift timing/);
assert.equal(roster.listShiftRules(true)[0].startTime, "09:00", "Rejected changes never mutate templates");

const historyBefore = outbox.exportOutbox().find(e => e.aggregateType === "staff_roster_slots" && e.aggregateId === scheduled.id);
const cancelled = roster.assignRosterSlot({
  id: scheduled.id, expectedVersion: 1, staffId: "staff-1", workDate: "2026-10-09",
  shiftRuleId: day.id, branchId: null, status: "cancelled",
});
assert.equal(cancelled.version, 2);
assert.equal(roster.listRosterSlots("2026-10-09", "2026-10-09").length, 0, "Planning excludes cancelled shifts");
assert.equal(roster.listRosterSlots().find(s => s.id === scheduled.id).status, "cancelled", "History remains available");
assert.equal(historyBefore.payload.status, "scheduled", "An outbox event is an immutable historical snapshot");
assert.throws(() => roster.assignRosterSlot({
  id: scheduled.id, expectedVersion: 1, staffId: "staff-1", workDate: "2026-10-09",
  shiftRuleId: day.id, branchId: null, status: "scheduled",
}), /revision conflict/);

const night = roster.createShiftRule({
  name: "Night", startTime: "22:00", endTime: "06:00",
  unpaidBreakMinutes: 30, branchId: null, active: true,
});
const overnight = roster.assignRosterSlot({
  staffId: "staff-1", shiftRuleId: night.id, workDate: "2026-10-10",
  branchId: null, status: "scheduled",
});
assert.equal(overnight.version, 1);
roster.updateShiftRule(night.id, { active: false });
assert.equal(roster.listShiftRules().some(s => s.id === night.id), false);
assert.equal(roster.listShiftRules(true).some(s => s.id === night.id), true);
assert.throws(() => roster.assignRosterSlot({
  staffId: "staff-2", shiftRuleId: night.id, workDate: "2026-10-11",
  branchId: null, status: "scheduled",
}), /inactive/);

// auditAction loads the audit store dynamically; wait for queued audit microtasks
// before exporting the canonical domain snapshot.
await new Promise(resolve => setImmediate(resolve));
const snapshot = persistence.exportDomainSnapshotFull();
assert.equal(snapshot.version, 14);
assert.equal(snapshot.shiftRules.length, 2);
assert.equal(snapshot.rosterSlots.length, 2);
const beforeAudit = audit.listAuditLogs(Number.MAX_SAFE_INTEGER).filter(e => String(e.action).startsWith("roster."));
assert.ok(beforeAudit.length >= 5, "Mutations generate retained audit records");

roster.hydratePhase6({ shiftRules: [], rosterSlots: [] });
assert.equal(roster.listRosterSlots().length, 0);
assert.equal(persistence.importDomainSnapshot(snapshot).ok, true, "SQLite/browser domain snapshot restores roster");
assert.equal(roster.listRosterSlots().length, 2);
assert.equal(roster.listShiftRules(true).find(s => s.id === night.id).active, false, "Historic inactive shift still restores");
assert.equal(roster.listRosterSlots().find(s => s.id === overnight.id).workDate, "2026-10-10");

const corrupt = structuredClone(snapshot);
corrupt.rosterSlots[1].shiftRuleId = "unknown";
const refused = persistence.importDomainSnapshot(corrupt);
assert.equal(refused.ok, false, "Snapshot import must reject invalid roster references");
assert.equal(roster.listRosterSlots().length, 2, "Failed import rolls back roster records");
assert.equal(roster.listShiftRules(true).length, 2, "Failed import rolls back shift templates");
const oldSnapshot = structuredClone(snapshot);
oldSnapshot.version = 13;
delete oldSnapshot.shiftRules;
delete oldSnapshot.rosterSlots;
assert.equal(persistence.importDomainSnapshot(oldSnapshot).ok, true, "Previous v13 snapshots remain importable");
assert.equal(roster.listRosterSlots().length, 0, "Old snapshots do not retain unrelated tenant roster state");

permissions.setCurrentRole("cashier");
assert.throws(() => roster.createShiftRule({
  name: "Cashier unauthorized", startTime: "09:00", endTime: "17:00",
  unpaidBreakMinutes: 0, branchId: null, active: true,
}), /permission/i);
assert.throws(() => roster.listRosterSlots(), /permission/i);
console.log("Roster durable domain: audit, immutable outbox, explicit revision, v14 round trip, v13 upgrade, rollback and RBAC PASS");
