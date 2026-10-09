import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url), ts = require("typescript");
require.extensions[".ts"] = (m, f) => m._compile(
  ts.transpileModule(fs.readFileSync(f, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, f,
);
const permissions = require("../permissions.ts");
const phase = require("../phase6-store.ts");
const remoteWriter = require("../remote-write.ts");
const outbox = require("../outbox-bridge.ts");
permissions.setCurrentRole("admin");
phase.hydratePhase6({ shiftRules: [], rosterSlots: [] });
const eventList = () => outbox.exportOutbox().filter(e =>
  e.aggregateType === "staff_shift_rules" || e.aggregateType === "staff_roster_slots");
const outstanding = () => eventList().filter(e => e.status === "pending" || e.status === "failed");

const local = phase.createShiftRule({
  name: "Reviewed local shift", startTime: "09:00", endTime: "17:00",
  unpaidBreakMinutes: 30, branchId: null, active: true,
});
const original = outstanding()[0];
const originalCopy = structuredClone(original);
let cloud = { ...local, version: 4, name: "Current Cloud shift" };
const confirmed = [];
remoteWriter.registerRemoteWriter({
  getRosterShift: async id => { assert.equal(id, local.id); return cloud; },
  upsertRosterEvent: async ev => { confirmed.push(structuredClone(ev)); },
});
const approved = await phase.reviewWorkforceRosterConflict(original.id);
const result = await phase.reapplyLocalWorkforceRosterConflict(approved);
assert.equal(result.version, 5);
assert.notEqual(result.eventId, original.id, "A new immutable event ID is required");
assert.equal(original.status, "discarded");
assert.equal(original.id, originalCopy.id);
assert.equal(original.sequence, originalCopy.sequence);
assert.deepEqual(original.payload, originalCopy.payload, "Rejected request bytes must not change");
const replacement = eventList().find(e => e.id === result.eventId);
assert.equal(replacement.status, "synced");
assert.equal(replacement.eventType, "update", "An existing Cloud row requires revisioned UPDATE");
assert.equal(replacement.payload.version, 5);
assert.equal(replacement.payload.name, local.name);
assert.equal(replacement.aggregateId, local.id);
assert.equal(confirmed.length, 1);
assert.equal(confirmed[0].id, result.eventId);
assert.equal(confirmed[0].sequence, replacement.sequence);
assert.equal(phase.listShiftRules(true).find(x => x.id === local.id).version, 5);
assert.equal(outstanding().length, 0);

// Stale UI Cloud snapshot cannot supersede an outstanding correction.
phase.updateShiftRule(local.id, { name: "Stale local correction" });
const staleEvent = outstanding()[0];
cloud = { ...cloud, version: 7, name: "Cloud revision seven" };
const staleReview = await phase.reviewWorkforceRosterConflict(staleEvent.id);
const beforeStale = structuredClone(eventList());
cloud = { ...cloud, version: 8, name: "Cloud revision eight" };
await assert.rejects(() => phase.reapplyLocalWorkforceRosterConflict(staleReview),
  /revision changed; review again before rebasing/);
assert.deepEqual(eventList(), beforeStale);
assert.equal(phase.listShiftRules(true).find(x=>x.id === local.id).name, "Stale local correction");

// Multiple unconfirmed dependent versions cannot be rebased out of sequence.
phase.updateShiftRule(local.id, { name: "More local changes" });
await assert.rejects(() => phase.reapplyLocalWorkforceRosterConflict(
  staleReview), /Multiple or dependent unconfirmed/);
const pendingBeforeRole = structuredClone(outstanding());
permissions.setCurrentRole("cashier");
await assert.rejects(() => phase.reapplyLocalWorkforceRosterConflict(staleReview),
  /Permission denied: staff.manage/);
assert.deepEqual(outstanding(), pendingBeforeRole);
permissions.setCurrentRole("admin");
for (const e of outstanding()) outbox.discardWorkforceRosterConflictEvent(e.id);

// A roster slot correction retains immutable staff/date/branch and gets remote version +1.
remoteWriter.registerRemoteWriter({ upsertRosterEvent: async () => {} });
const slot = phase.assignRosterSlot({
  staffId: "staff-1", workDate: "2026-10-20", shiftRuleId: local.id,
  branchId: null, status: "scheduled",
});
await phase.flushWorkforceRosterOutbox();
const slotLocal = phase.assignRosterSlot({
  id: slot.id, expectedVersion: slot.version, staffId: slot.staffId,
  workDate: slot.workDate, shiftRuleId: local.id, branchId: null, status: "cancelled",
});
const oldSlotEvent = outstanding()[0];
assert.equal(slotLocal.version, 2);
let remoteSlot = { ...slot, version: 7, status: "scheduled" };
remoteWriter.registerRemoteWriter({
  getRosterSlot: async id => { assert.equal(id, slot.id); return remoteSlot; },
  upsertRosterEvent: async e => { confirmed.push(structuredClone(e)); },
});
const reviewedSlot = await phase.reviewWorkforceRosterConflict(oldSlotEvent.id);
const confirmedSlot = await phase.reapplyLocalWorkforceRosterConflict(reviewedSlot);
assert.equal(confirmedSlot.version, 8);
assert.equal(oldSlotEvent.status, "discarded");
assert.equal(eventList().find(e => e.id === confirmedSlot.eventId).status, "synced");
const storedSlot = phase.listRosterSlots().find(x => x.id === slot.id);
assert.equal(storedSlot.status, "cancelled");
assert.equal(storedSlot.version, 8);
assert.equal(storedSlot.staffId, slot.staffId);
assert.equal(storedSlot.workDate, slot.workDate);

// Different staff/date identity behind the same ID must never be rebased.
phase.assignRosterSlot({ id: slot.id, expectedVersion: 8, staffId: slot.staffId,
  workDate: slot.workDate, shiftRuleId: local.id, branchId: null, status: "scheduled" });
const identityEvent = outstanding()[0];
remoteSlot = { ...remoteSlot, staffId: "staff-2", version: 10 };
const identityReview = await phase.reviewWorkforceRosterConflict(identityEvent.id);
await assert.rejects(() => phase.reapplyLocalWorkforceRosterConflict(identityReview),
  /Different staff, date or branch/);
assert.equal(identityEvent.status, "pending");
for (const e of outstanding()) outbox.discardWorkforceRosterConflictEvent(e.id);

// Unknown canonical remote ID / missing remote row cannot be force-created.
const created = phase.createShiftRule({
  name: "No Cloud counterpart", startTime: "18:00", endTime: "23:00",
  unpaidBreakMinutes: 0, branchId: null, active: true,
});
const creationEvent = outstanding()[0];
remoteWriter.registerRemoteWriter({
  getRosterShift: async () => null,
  upsertRosterEvent: async () => { throw new Error("Must not reach server"); },
});
const uncommittedReview = await phase.reviewWorkforceRosterConflict(creationEvent.id);
await assert.rejects(() => phase.reapplyLocalWorkforceRosterConflict(uncommittedReview),
  /Missing or different-ID Cloud record/);
assert.equal(creationEvent.status, "pending");
assert.ok(phase.listShiftRules(true).find(x=>x.id===created.id));
for(const e of outstanding()) outbox.discardWorkforceRosterConflictEvent(e.id);

// A failed rebased RPC preserves the new event and an explicit retry replays
// the identical ID/sequence/payload rather than rewriting the rejected one.
phase.updateShiftRule(local.id, { name: "Desired after outage" });
const failedOriginal = outstanding()[0];
cloud = { ...local, version: 12, name: "Cloud before outage" };
let sent = [];
remoteWriter.registerRemoteWriter({
  getRosterShift: async () => cloud,
  upsertRosterEvent: async e => { sent.push(structuredClone(e)); throw new Error("temporary RPC outage"); },
});
const outageReview = await phase.reviewWorkforceRosterConflict(failedOriginal.id);
await assert.rejects(() => phase.reapplyLocalWorkforceRosterConflict(outageReview), /temporary RPC outage/);
assert.equal(failedOriginal.status, "discarded");
assert.equal(outstanding().length, 1);
const failedReplacement = outstanding()[0], originalReplacement = structuredClone(failedReplacement);
assert.notEqual(failedReplacement.id, failedOriginal.id);
assert.equal(failedReplacement.status, "failed");
assert.equal(failedReplacement.payload.version, 13);
assert.match(failedReplacement.lastError, /temporary RPC outage/);
remoteWriter.registerRemoteWriter({ upsertRosterEvent: async e => sent.push(structuredClone(e)) });
assert.equal(await phase.flushWorkforceRosterOutbox(), 1);
assert.equal(failedReplacement.status, "synced");
assert.deepEqual(sent.map(e=>e.id), [originalReplacement.id, originalReplacement.id]);
assert.deepEqual(sent.map(e=>e.payload), [originalReplacement.payload, originalReplacement.payload]);

// A session revocation while the authority is being refreshed preserves the
// original unconfirmed event, even if the remote read eventually succeeds.
phase.updateShiftRule(local.id, { name: "Must not cross tenants" });
const revokedEvent = outstanding()[0];
cloud = { ...cloud, version: 15 };
let notify, resume;
const started = new Promise(resolve => { notify = resolve; });
const held = new Promise(resolve => { resume = resolve; });
remoteWriter.registerRemoteWriter({
  getRosterShift: async () => cloud,
  upsertRosterEvent: async () => {},
});
const revokedReview = await phase.reviewWorkforceRosterConflict(revokedEvent.id);
remoteWriter.registerRemoteWriter({
  getRosterShift: async () => { notify(); await held; return cloud; },
  upsertRosterEvent: async () => {},
});
const resolving = phase.reapplyLocalWorkforceRosterConflict(revokedReview);
await started;
remoteWriter.registerRemoteWriter(null);
resume();
await assert.rejects(resolving, /session changed while reviewing/);
assert.equal(revokedEvent.status, "pending");
assert.equal(outstanding().length, 1);
assert.equal(phase.listShiftRules(true).find(x=>x.id===local.id).name, "Must not cross tenants");
console.log("HR-004 Reapply Local: rebase, immutable event, stale revision, RBAC, slot identity, RPC retry and session revocation PASS");
