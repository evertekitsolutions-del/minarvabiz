import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename,
);

const outbox = require("../outbox-bridge.ts");
const cloud = require("../remote-write.ts");
const SCOPE_A = "org-A:user-A";
const SCOPE_B = "org-B:user-B";

function reset(scope = null, writer = null, writerScope = null) {
  cloud.registerRemoteWriter(null);
  outbox.hydrateOutbox([]);
  outbox.setOutboxScope(scope);
  if (writer) cloud.registerRemoteWriter(writer, writerScope);
}
const outstanding = () => outbox.exportOutbox().filter(event => event.status !== "synced" && event.status !== "discarded");

function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { release, promise };
}

test("offline queue stores verified owner scope across a full snapshot hydration", async () => {
  reset(SCOPE_A);
  await cloud.remoteUpsertCategory({id:"category-1",name:"Material"});
  const snapshot = structuredClone(outbox.exportOutbox());
  assert.equal(snapshot.length,1);
  assert.equal(snapshot[0].ownerScope,SCOPE_A);
  assert.equal(snapshot[0].status,"pending");
  outbox.hydrateOutbox([]);
  outbox.hydrateOutbox(snapshot);
  assert.deepEqual(outbox.exportOutbox(),snapshot);
});

test("same authorized organization/user can replay offline category/customer after reconnect", async () => {
  const calls=[];
  reset(SCOPE_A);
  await cloud.remoteUpsertCategory({id:"category-1",name:"Material"});
  await cloud.remoteUpsertCustomer({id:"customer-1",name:"Buyer"});
  assert.deepEqual(outstanding().map(e => e.status),["pending","pending"]);
  cloud.registerRemoteWriter({
    upsertCategory:async payload => { calls.push("category:"+payload.id); },
    upsertCustomer:async payload => { calls.push("customer:"+payload.id); },
  },SCOPE_A);
  assert.equal(cloud.getScopedMasterReplayStatus().ready,2);
  const result=await cloud.retryScopedMasterOutbox();
  assert.deepEqual(calls,["category:category-1","customer:customer-1"]);
  assert.equal(result.acknowledged,2);
  assert.equal(result.failed,0);
  assert.equal(cloud.getScopedMasterReplayStatus().ready,0);
  assert.deepEqual(outbox.exportOutbox().map(e=>e.status),["synced","synced"]);
  assert.equal((await cloud.retryScopedMasterOutbox()).attempted,0,"success must not replay twice");
});

test("different tenant, missing scope and legacy unscoped records fail closed", async () => {
  const calls=[];
  reset(SCOPE_A);
  await cloud.remoteUpsertCategory({id:"private-category"});
  cloud.registerRemoteWriter({upsertCategory:async ()=>calls.push("uploaded")},SCOPE_B);
  assert.equal((await cloud.retryScopedMasterOutbox()).acknowledged,0);
  assert.deepEqual(calls,[]);
  assert.equal(outstanding().length,1);
  outbox.setOutboxScope(SCOPE_B);
  assert.equal((await cloud.retryScopedMasterOutbox()).acknowledged,0);
  reset(null);
  await cloud.remoteUpsertCategory({id:"legacy-no-owner"});
  outbox.setOutboxScope(SCOPE_A);
  cloud.registerRemoteWriter({upsertCategory:async ()=>calls.push("uploaded")},SCOPE_A);
  assert.equal((await cloud.retryScopedMasterOutbox()).acknowledged,0);
  assert.deepEqual(calls,[]);
  assert.equal(outstanding().length,1);
});

test("financial outbox stays unacknowledged and customer/stock replay stays blocked until transactional reconciliation", async () => {
  const calls=[];
  reset(SCOPE_A);
  await cloud.remoteUpsertCustomer({id:"c-finance",name:"Receivable owner"});
  await cloud.remoteUpsertProduct({id:"p-stock",name:"Stock item"});
  await cloud.remoteCreateSale({id:"sale-unreconciled"},[{id:"payment-unreconciled"}]);
  await cloud.remoteUpsertCategory({id:"safe-category"});
  cloud.registerRemoteWriter({
    upsertCustomer:async () => calls.push("customer"),
    upsertProduct:async () => calls.push("product"),
    upsertCategory:async () => calls.push("category"),
    createSale:async () => calls.push("sale"),
  },SCOPE_A);
  const result=await cloud.retryScopedMasterOutbox();
  assert.deepEqual(calls,["category"],"master replay must not pre-empt financial/stock settlement");
  assert.equal(result.acknowledged,1);
  assert.deepEqual(outstanding().map(e => e.aggregateType),["customers","products","sales","payments"]);
  assert.equal(cloud.getScopedMasterReplayStatus().blocked >= 4,true);
});

test("failed cloud writer leaves the exact original outbox event retryable", async () => {
  const calls=[];
  reset(SCOPE_A);
  await cloud.remoteUpsertCategory({id:"retry-category"});
  const id=outstanding()[0].id;
  cloud.registerRemoteWriter({upsertCategory:async ()=>{calls.push("failed");throw Error("RLS denied");}},SCOPE_A);
  const first=await cloud.retryScopedMasterOutbox();
  assert.equal(first.acknowledged,0);
  assert.equal(first.failed,1);
  assert.equal(outstanding()[0].id,id);
  assert.equal(outstanding()[0].status,"failed");
  cloud.registerRemoteWriter({upsertCategory:async ()=>calls.push("ok")},SCOPE_A);
  const second=await cloud.retryScopedMasterOutbox();
  assert.equal(second.acknowledged,1);
  assert.equal(outbox.exportOutbox()[0].id,id);
  assert.equal(outbox.exportOutbox()[0].status,"synced");
  assert.deepEqual(calls,["failed","ok"]);
});

test("overlapping retry actions share one flight; session revocation during upload prevents old ack", async () => {
  const blocked=gate();
  let calls=0;
  reset(SCOPE_A);
  await cloud.remoteUpsertCategory({id:"pending-category"});
  cloud.registerRemoteWriter({upsertCategory:async ()=>{calls++;await blocked.promise;}},SCOPE_A);
  const first=cloud.retryScopedMasterOutbox();
  const second=cloud.retryScopedMasterOutbox();
  assert.equal(first,second,"concurrent buttons should not post the same event twice");
  cloud.registerRemoteWriter(null);
  outbox.setOutboxScope(null);
  blocked.release();
  await Promise.all([first,second]);
  assert.equal(calls,1);
  assert.equal(outstanding().length,1);
  assert.equal(outbox.exportOutbox()[0].status,"pending");
});

test("delete and malformed master events never become blind upserts", async () => {
  const calls=[];
  reset(SCOPE_A);
  outbox.enqueueOutbox("categories","deleted-category","delete",{id:"deleted-category",name:"Deleted"});
  outbox.enqueueOutbox("categories","malformed","insert",{id:"different-category",name:"Wrong"});
  cloud.registerRemoteWriter({upsertCategory:async ()=>calls.push("upsert")},SCOPE_A);
  const result=await cloud.retryScopedMasterOutbox();
  assert.equal(result.acknowledged,0);
  assert.deepEqual(calls,[]);
  assert.equal(outstanding().length,2);
});


test("retry status never reveals pending counts from another org or unverified session", async () => {
  reset(SCOPE_A);
  await cloud.remoteUpsertCategory({id:"tenant-a-private"});
  outbox.setOutboxScope(SCOPE_B);
  cloud.registerRemoteWriter({upsertCategory:async ()=>{}},SCOPE_B);
  assert.deepEqual(cloud.getScopedMasterReplayStatus(), {
    available:true, pending:0, ready:0, blocked:0,
  });
  cloud.registerRemoteWriter(null);
  assert.deepEqual(cloud.getScopedMasterReplayStatus(), {
    available:false, pending:0, ready:0, blocked:0,
  });
});

test("web replay is reachable only through server verified org/user identity and secure logout", () => {
  const dataSource=fs.readFileSync("apps/web/src/lib/data-source.ts","utf8");
  const layout=fs.readFileSync("apps/web/src/components/AppLayoutClient.tsx","utf8");
  const session=fs.readFileSync("packages/business-logic/src/session.ts","utf8");
  const settings=fs.readFileSync("apps/web/src/app/(app)/settings/page.tsx","utf8");
  assert.match(dataSource,/await resolveOnlineAuthorization\(accessToken, sessionUser\.id\)/);
  assert.match(dataSource,/registerRemoteWriter\(\{/);
  assert.match(dataSource,/verifiedOwnerScope\)/);
  assert.match(layout,/setOutboxScope\(authorization\.orgId \+ ":" \+ authoritativeUser\.id\)/);
  assert.match(session,/registerRemoteWriter\(null\)/);
  assert.match(session,/setOutboxScope\(null\)/);
  assert.match(settings,/Retry safe queued records/);
  assert.match(settings,/getScopedMasterReplayStatus\(\)/);
  assert.match(settings,/retryScopedMasterOutbox\(\)/);
  assert.match(settings,/addEventListener\("online"/);
});

test("authorized cloud hydration rejects stale login tokens at writer-registration boundary", () => {
  const source=fs.readFileSync("apps/web/src/lib/data-source.ts","utf8");
  assert.match(source,/getSessionToken\(\) !== accessToken/);
  assert.match(source,/registerRemoteWriter\(null\)/);
  assert.match(source,/setOutboxScope\(null\)/);
});
