/**
 * Real SQLite binary backup/restore of HR-004 revisioned conflict history.
 * This is isolated engine-level fault injection, not a customer installer UAT.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const databaseRequire = createRequire(new URL("../../../database/package.json", import.meta.url));
const initSqlJs = databaseRequire("sql.js");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText, filename,
);
const phase = require("../phase6-store.ts");
const outbox = require("../outbox-bridge.ts");
const permissions = require("../permissions.ts");
const remoteWriter = require("../remote-write.ts");
const persistence = require("../persistence.ts");
permissions.setCurrentRole("admin");
phase.hydratePhase6({shiftRules:[],rosterSlots:[]});
outbox.hydrateOutbox([]);
const hrEvents = () => outbox.exportOutbox().filter(e =>
  e.aggregateType === "staff_shift_rules" || e.aggregateType === "staff_roster_slots");

const shift = phase.createShiftRule({name:"SQLite Recovery Shift",
  startTime:"09:00",endTime:"17:00",unpaidBreakMinutes:30,branchId:null,active:true});
remoteWriter.registerRemoteWriter({upsertRosterEvent:async()=>{}});
assert.equal(await phase.flushWorkforceRosterOutbox(),1);
const slot = phase.assignRosterSlot({staffId:"staff-1",shiftRuleId:shift.id,
  workDate:"2026-10-21",branchId:null,status:"scheduled"});
assert.equal(await phase.flushWorkforceRosterOutbox(),1);

// Accepted Cloud conflict: first event must be discarded but never deleted.
phase.updateShiftRule(shift.id,{name:"Cloud-approved local correction"});
const superseded = hrEvents().at(-1);
const cloud = {...shift,version:5,name:"Older Cloud shift name"};
remoteWriter.registerRemoteWriter({
  getRosterShift:async id=>{assert.equal(id,shift.id);return cloud;},
  upsertRosterEvent:async()=>{},
});
const reviewed = await phase.reviewWorkforceRosterConflict(superseded.id);
const rebased = await phase.reapplyLocalWorkforceRosterConflict(reviewed);
assert.equal(rebased.version,6);
assert.equal(superseded.status,"discarded");
assert.equal(hrEvents().at(-1).status,"synced");
assert.notEqual(rebased.eventId,superseded.id);

// An interrupted remote correction must remain in the native SQLite backup.
phase.updateShiftRule(shift.id,{name:"Offline change needs retry"});
remoteWriter.registerRemoteWriter({
  upsertRosterEvent:async()=>{throw new Error("network loss before acknowledgement");},
});
await assert.rejects(()=>phase.flushWorkforceRosterOutbox(),/network loss/);
const failed = hrEvents().at(-1);
assert.equal(failed.status,"failed");
const immutableBefore = structuredClone(hrEvents());
const domainBefore = structuredClone(phase.exportPhase6State());
await new Promise(resolve=>setImmediate(resolve));
const snapshot = persistence.exportDomainSnapshotFull();
assert.equal(snapshot.version,14);
assert.deepEqual(snapshot.outbox.filter(e=>e.aggregateType==="staff_shift_rules"||e.aggregateType==="staff_roster_slots"),immutableBefore);
assert.equal(snapshot.rosterSlots.length,1);
assert.equal(snapshot.shiftRules.find(s=>s.id===shift.id).name,"Offline change needs retry");

const SQL = await initSqlJs();
const folder = fs.mkdtempSync(path.join(os.tmpdir(),"minarvabiz-hr004-sqlite-"));
const live = path.join(folder,"domain.db"),backup = path.join(folder,"domain.backup.db");
try {
  const db = new SQL.Database();
  db.run("CREATE TABLE domain_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  db.run("INSERT INTO domain_kv(key,value) VALUES (?,?)",
    ["domain_snapshot_v2",JSON.stringify(snapshot)]);
  fs.writeFileSync(live,Buffer.from(db.export()));
  db.close();
  fs.copyFileSync(live,backup);
  fs.writeFileSync(live,Buffer.from("damaged SQLite file"));
  assert.throws(()=>new SQL.Database(fs.readFileSync(live)).exec("PRAGMA integrity_check"),
    /database|file|not a database|malformed/i);
  // Restore precisely the backup bytes, not a synthetic replacement JSON.
  fs.copyFileSync(backup,live);
  const restoredDb = new SQL.Database(fs.readFileSync(live));
  const rows = restoredDb.exec("SELECT value FROM domain_kv WHERE key='domain_snapshot_v2'");
  const parsed = JSON.parse(String(rows[0].values[0][0]));
  restoredDb.close();

  phase.hydratePhase6({shiftRules:[],rosterSlots:[]});
  outbox.hydrateOutbox([]);
  assert.equal(hrEvents().length,0);
  const restored = persistence.importDomainSnapshot(parsed);
  assert.equal(restored.ok,true,restored.error);
  assert.deepEqual(hrEvents(),immutableBefore,"SQLite preserves immutable event IDs, order and statuses");
  assert.equal(phase.listShiftRules(true).find(s=>s.id===shift.id).version,domainBefore.shiftRules.find(s=>s.id===shift.id).version);
  assert.equal(phase.listRosterSlots().find(s=>s.id===slot.id).status,"scheduled");
  assert.equal(hrEvents().find(e=>e.id===superseded.id).status,"discarded");
  assert.equal(hrEvents().find(e=>e.id===failed.id).status,"failed");

  const corrupt = structuredClone(parsed);
  corrupt.rosterSlots[0].shiftRuleId = "missing-template";
  const denied = persistence.importDomainSnapshot(corrupt);
  assert.equal(denied.ok,false,"Corrupt backup cannot partially replace valid history");
  assert.deepEqual(hrEvents(),immutableBefore,"Failed import rolls back outbox history");
  assert.equal(phase.listRosterSlots().find(s=>s.id===slot.id).shiftRuleId,shift.id);

  const replayed = [];
  remoteWriter.registerRemoteWriter({upsertRosterEvent:async event => {
    replayed.push(structuredClone(event));
  }});
  assert.equal(await phase.flushWorkforceRosterOutbox(),1,"Only unconfirmed saved event is retried");
  assert.deepEqual(replayed.map(e=>e.id),[failed.id]);
  assert.deepEqual(replayed[0].payload,failed.payload,"Never mutate replay payload/version");
  assert.equal(hrEvents().find(e=>e.id===failed.id).status,"synced");
  assert.equal(hrEvents().find(e=>e.id===superseded.id).status,"discarded");
  assert.equal(hrEvents().find(e=>e.id===rebased.eventId).status,"synced");
} finally {
  remoteWriter.registerRemoteWriter(null);
  fs.rmSync(folder,{recursive:true,force:true});
}
console.log("HR-004 real SQLite backup/restore: discarded audit, immutable retry identity, corruption rollback and replay PASS");
