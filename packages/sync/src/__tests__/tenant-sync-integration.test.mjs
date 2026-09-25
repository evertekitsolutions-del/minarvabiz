import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );

const { SyncEngine, createMemoryLocalStore } = require("../engine.ts");
const { createSupabaseCloudAdapter } = require("../supabase-adapter.ts");

const ORG_A = "10000000-0000-0000-0000-000000000001";
const ORG_B = "20000000-0000-0000-0000-000000000002";
const DEVICE_A = "da000000-0000-0000-0000-000000000001";
const DEVICE_B = "db000000-0000-0000-0000-000000000001";
const T0 = "2026-09-25T00:00:00.000Z";

class TenantAwarePgServer {
  constructor() {
    this.tables = new Map();
    this.failSelectTable = null;
  }

  bucket(table) {
    let bucket = this.tables.get(table);
    if (!bucket) {
      bucket = new Map();
      this.tables.set(table, bucket);
    }
    return bucket;
  }

  seed(table, orgId, row) {
    this.bucket(table).set(String(row.id), {
      ...row,
      org_id: orgId,
      updated_at: row.updated_at ?? row.updatedAt ?? T0,
    });
  }

  rows(table, orgId) {
    return [...this.bucket(table).values()].filter((row) => row.org_id === orgId);
  }

  client(orgId) {
    const server = this;
    return {
      async insert(table, input) {
        const rows = Array.isArray(input) ? input : [input];
        for (const raw of rows) {
          if (raw.org_id != null && raw.org_id !== orgId) {
            return { error: "new row violates row-level security policy" };
          }
          const id = String(raw.id);
          const bucket = server.bucket(table);
          const existing = bucket.get(id);
          if (existing) return { error: "duplicate key" };
          bucket.set(id, {
            ...raw,
            id,
            org_id: orgId,
            updated_at: raw.updated_at ?? raw.updatedAt ?? T0,
            created_at: raw.created_at ?? raw.createdAt ?? T0,
          });
        }
        return { error: null };
      },

      async update(table, match, patch) {
        const matchId = /(?:^|&)id=eq\.([^&]+)/.exec(match)?.[1];
        const orderId = /(?:^|&)order_id=eq\.([^&]+)/.exec(match)?.[1];
        const bucket = server.bucket(table);
        const target = [...bucket.values()].find((row) =>
          matchId ? String(row.id) === decodeURIComponent(matchId)
            : orderId ? String(row.order_id) === decodeURIComponent(orderId)
              : false
        );
        if (!target || target.org_id !== orgId) {
          return { error: "row-level security denied update" };
        }
        if (patch.org_id != null && patch.org_id !== orgId) {
          return { error: "new row violates row-level security policy" };
        }
        bucket.set(String(target.id), {
          ...target,
          ...patch,
          org_id: orgId,
          updated_at: patch.updated_at ?? patch.updatedAt ?? target.updated_at,
        });
        return { error: null };
      },

      async select(table, query) {
        if (server.failSelectTable === table) {
          return { data: null, error: "simulated PostgREST/RLS read failure" };
        }
        let rows = server.rows(table, orgId);

        const saleIds = /sale_id=in\.\(([^)]*)\)/.exec(query)?.[1];
        if (saleIds) {
          const allowed = new Set(saleIds.split(",").map((value) => decodeURIComponent(value)));
          rows = rows.filter((row) => allowed.has(String(row.sale_id)));
        }

        return { data: rows.map((row) => ({ ...row })), error: null };
      },
    };
  }
}

const server = new TenantAwarePgServer();
server.seed("customers", ORG_B, {
  id: "cb000000-0000-0000-0000-000000000001",
  name: "Tenant B customer",
  version: 1,
  updated_at: "2026-09-25T00:01:00.000Z",
});

const localA = createMemoryLocalStore();
const adapterA = createSupabaseCloudAdapter(server.client(ORG_A), DEVICE_A);
const engineA = new SyncEngine(DEVICE_A, adapterA, localA);

const customerA = {
  id: "ca000000-0000-0000-0000-000000000001",
  name: "Tenant A offline customer",
  version: 1,
  updatedAt: "2026-09-25T00:02:00.000Z",
  deletedAt: null,
};

engineA.setOnline(false);
engineA.writeLocal("customers", customerA, "insert");
const offline = await engineA.sync();
assert.equal(offline.status, "failed");
assert.equal(offline.lastError, "Device offline");
assert.equal(engineA.outbox.stats().pending, 1, "offline write must stay queued");
assert.equal(server.rows("customers", ORG_A).length, 0, "offline write must not reach cloud");

engineA.setOnline(true);
const online = await engineA.sync();
assert.equal(online.status, "completed");
assert.equal(online.pushed, 1);
assert.equal(engineA.outbox.stats().pending, 0);
assert.equal(engineA.outbox.stats().synced, 1);
assert.equal(server.rows("customers", ORG_A).length, 1, "queued write must reach own tenant after reconnect");
assert.equal(server.rows("outbox_events", ORG_A).length, 1, "accepted cloud write must record synced outbox event");

const updateEvent = {
  id: "ea000000-0000-0000-0000-000000000002",
  aggregateType: "customers",
  aggregateId: customerA.id,
  eventType: "update",
  payload: { ...customerA, name: "Tenant A updated customer", version: 2, updatedAt: "2026-09-25T00:02:30.000Z" },
  occurredAt: "2026-09-25T00:02:30.000Z",
  deviceId: DEVICE_A,
  sequence: 2,
  status: "pending",
  attempts: 0,
  lastError: null,
};
const updated = await adapterA.push([updateEvent]);
assert.deepEqual(updated.accepted, [updateEvent.id], "duplicate insert must fall back to tenant-scoped update");
assert.equal(server.rows("customers", ORG_A)[0].name, "Tenant A updated customer");

const deleteEvent = {
  id: "ea000000-0000-0000-0000-000000000003",
  aggregateType: "customers",
  aggregateId: customerA.id,
  eventType: "delete",
  payload: { ...customerA, version: 3, updatedAt: "2026-09-25T00:02:45.000Z" },
  occurredAt: "2026-09-25T00:02:45.000Z",
  deviceId: DEVICE_A,
  sequence: 3,
  status: "pending",
  attempts: 0,
  lastError: null,
};
const deleted = await adapterA.push([deleteEvent]);
assert.deepEqual(deleted.accepted, [deleteEvent.id], "tenant-scoped soft delete must be accepted");
assert.ok(server.rows("customers", ORG_A)[0].deleted_at, "delete push must soft-delete the own-tenant row");
assert.equal(server.rows("outbox_events", ORG_A).length, 3, "each accepted mutation must have one remote outbox acknowledgement");

assert.equal(
  localA.get("customers", "cb000000-0000-0000-0000-000000000001"),
  null,
  "Tenant A pull must not hydrate Tenant B data",
);

const localB = createMemoryLocalStore();
const adapterB = createSupabaseCloudAdapter(server.client(ORG_B), DEVICE_B);
const engineB = new SyncEngine(DEVICE_B, adapterB, localB);
const syncB = await engineB.sync();
assert.equal(syncB.status, "completed");
assert.ok(localB.get("customers", "cb000000-0000-0000-0000-000000000001"));
assert.equal(
  localB.get("customers", customerA.id),
  null,
  "Tenant B pull must not hydrate Tenant A data",
);

const rejectedEvent = {
  id: "ea000000-0000-0000-0000-000000000099",
  aggregateType: "customers",
  aggregateId: "ca000000-0000-0000-0000-000000000099",
  eventType: "insert",
  payload: {
    id: "ca000000-0000-0000-0000-000000000099",
    org_id: ORG_B,
    name: "cross tenant attempt",
    version: 1,
    updatedAt: "2026-09-25T00:03:00.000Z",
  },
  occurredAt: "2026-09-25T00:03:00.000Z",
  deviceId: DEVICE_A,
  sequence: 99,
  status: "pending",
  attempts: 0,
  lastError: null,
};

const rejected = await adapterA.push([rejectedEvent]);
assert.deepEqual(rejected.accepted, []);
assert.equal(rejected.rejected.length, 1);
assert.match(rejected.rejected[0].error, /row-level security/i);
assert.equal(
  server.rows("outbox_events", ORG_A).some((row) => row.id === rejectedEvent.id),
  false,
  "rejected domain mutation must not be falsely logged as synced remotely",
);

server.failSelectTable = "products";
await assert.rejects(
  () => adapterA.pull(new Date(0).toISOString(), DEVICE_A),
  /Supabase pull failed for products: simulated PostgREST\/RLS read failure/,
  "pull errors must fail closed instead of silently appearing as empty tenant data",
);

server.seed("sales", ORG_A, {
  id: "sa000000-0000-0000-0000-000000000001",
  invoice_number: "INV-A-1",
  version: 1,
  updated_at: "2026-09-25T00:04:00.000Z",
});
server.failSelectTable = "sale_items";
await assert.rejects(
  () => adapterA.pull(new Date(0).toISOString(), DEVICE_A),
  /Supabase pull failed for sale_items: simulated PostgREST\/RLS read failure/,
  "sale child pull errors must also fail closed after parent sales are selected",
);

server.failSelectTable = "products";
const faultEngine = new SyncEngine(
  "df000000-0000-0000-0000-000000000001",
  adapterA,
  createMemoryLocalStore(),
);
const faultSession = await faultEngine.sync();
assert.equal(faultSession.status, "failed");
assert.match(faultSession.lastError, /Supabase pull failed for products/);

console.log(
  "Tenant sync integration PASS: offline queue/reconnect, tenant-separated pulls, rejected cross-tenant push, remote outbox integrity and fail-closed pull errors.",
);
