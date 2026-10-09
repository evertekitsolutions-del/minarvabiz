import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (m, filename) => m._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename,
);
const { createSupabaseCloudAdapter } = require("../../../sync/src/supabase-adapter.ts");
const calls = [], direct = [], selected = [];
let reply = null;
const client = {
  async rpc(name, args) {
    calls.push({ name, args: structuredClone(args) });
    return reply ? reply(args) : { data: { accepted: true, record: { id: args.p_record.id } }, error: null };
  },
  async insert(table, row) { direct.push({ table, row }); return { error: null }; },
  async update(table, match, row) { direct.push({ table, match, row }); return { error: null }; },
  async select(table) {
    selected.push(table);
    if (table === "staff_shift_rules") return { data: [{ id: "shift-a", version: 1, updated_at: "2026-10-09T00:00:00Z" }], error: null };
    return { data: [], error: null };
  },
};
const adapter = createSupabaseCloudAdapter(client, "device-one");
const event = (id, table, payload, sequence = 1, operation = "insert") => ({
  id, aggregateId: payload.id, aggregateType: table, eventType: operation, sequence,
  occurredAt: "2026-10-09T00:00:00Z", payload,
});
const shift = { id: "shift-a", name: "Day", startTime: "09:00", endTime: "17:00", unpaidBreakMinutes: 30, active: true, branchId: null, version: 1 };
const roster = { id: "slot-a", staffId: "staff-a", shiftRuleId: shift.id, workDate: "2026-10-09", branchId: null, status: "scheduled", version: 1 };
const good = await adapter.push([
  event("ev-shift", "staff_shift_rules", shift),
  event("ev-slot", "staff_roster_slots", roster, 2),
]);
assert.deepEqual(good.accepted, ["ev-shift", "ev-slot"]);
assert.deepEqual(good.rejected, []);
assert.equal(direct.length, 0, "HR writes must never use DML or generic outbox insert");
assert.deepEqual(calls.map(c => c.args.p_kind), ["shift", "roster"]);
assert.equal(calls.every(c => c.name === "apply_staff_roster_event"), true);
assert.deepEqual(calls.map(c => c.args.p_event_id), ["ev-shift", "ev-slot"]);
assert.deepEqual(calls.map(c => c.args.p_sequence), [1, 2]);
assert.equal(calls[0].args.p_device_id, "device-one");
assert.deepEqual(calls[0].args.p_record, shift, "Immutable camelCase event payload is preserved");
calls.length = 0;
reply = args => ({ data: { accepted: true, replayed: true, id: args.p_record.id }, error: null });
const replay = await adapter.push([event("ev-shift", "staff_shift_rules", shift)]);
assert.deepEqual(replay.accepted, ["ev-shift"], "Idempotent replay is acknowledged");
reply = () => ({ data: { accepted: false, remote: { id: "shift-a", version: 9 } }, error: null });
calls.length = 0;
const conflict = await adapter.push([
  event("ev-old", "staff_shift_rules", shift),
  event("ev-next", "staff_shift_rules", { ...shift, version: 2 }, 3, "update"),
  event("ev-dependent", "staff_roster_slots", roster, 4),
]);
assert.deepEqual(conflict.accepted, []);
assert.deepEqual(conflict.rejected.map(r => r.id), ["ev-old", "ev-next", "ev-dependent"]);
assert.equal(calls.length, 1, "No later revision or dependent roster slot is posted after a failed shift");
assert.equal(conflict.rejected[0].remote.version, 9);
reply = () => ({ data: { accepted: true, record: { id: "WRONG" } }, error: null });
const forged = await adapter.push([event("ev-wrong", "staff_roster_slots", roster)]);
assert.equal(forged.accepted.length, 0);
assert.match(forged.rejected[0].error, /identity mismatch/);
reply = () => ({ data: null, error: "Workforce roster permission denied" });
const unauthorized = await adapter.push([event("ev-denied", "staff_roster_slots", roster)]);
assert.deepEqual(unauthorized.accepted, []);
assert.match(unauthorized.rejected[0].error, /permission denied/);
reply = args => ({ data: { accepted: true, record: { id: args.p_record.id } }, error: null });
const deleted = await adapter.push([event("ev-delete", "staff_roster_slots", roster, 1, "delete")]);
assert.deepEqual(deleted.accepted, []);
assert.match(deleted.rejected[0].error, /hard deletion/);
const tamperedEvent = event("ev-id", "staff_shift_rules", { ...shift, id: "tampered" });
tamperedEvent.aggregateId = shift.id;
const tampered = await adapter.push([tamperedEvent]);
assert.deepEqual(tampered.accepted, []);
assert.match(tampered.rejected[0].error, /Invalid immutable/);
const invalidVersion = await adapter.push([event("ev-version", "staff_shift_rules", { ...shift, version: 0 })]);
assert.deepEqual(invalidVersion.accepted, []);
assert.match(invalidVersion.rejected[0].error, /Invalid immutable/);
await adapter.pull("2026-10-01T00:00:00Z", "device-one");
assert.ok(selected.includes("staff_shift_rules"));
assert.ok(selected.includes("staff_roster_slots"));
assert.equal(direct.length, 0);
console.log("HR roster cloud adapter: atomic RPC, replay, conflict ordering, authorization, ack identity and pull PASS");
