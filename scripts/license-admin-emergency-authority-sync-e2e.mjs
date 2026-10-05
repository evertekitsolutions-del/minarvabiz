import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  buildLegacyEmergencySyncPayload,
  syncLegacyEmergencyAuthority,
} from "../apps/license-admin/scripts/sync-emergency-authority.mjs";

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    ...options,
  }).trim();
}

function deepValue(value, key) {
  if (!value || typeof value !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(value, key)) return value[key];
  for (const child of Object.values(value)) {
    const found = deepValue(child, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

const status = JSON.parse(run("supabase", ["status", "-o", "json"]));
const apiUrl = String(deepValue(status, "API_URL") || "").replace(/\/$/, "");
const serviceRoleKey = String(deepValue(status, "SERVICE_ROLE_KEY") || "").trim();
const dbUrl = String(deepValue(status, "DB_URL") || "").trim();

assert.match(apiUrl, /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/);
assert.ok(serviceRoleKey.length >= 20);
assert.match(dbUrl, /^postgres(?:ql)?:\/\//);

const nowMs = Date.now();
const actorEmail = "legacy-sync-emergency@example.test";
const actorName = "Legacy Sync Emergency Operator";
const firstCurrent = "Legacy-Current-Credential-" + "a".repeat(40);
const rotatedCurrent = "Legacy-Rotated-Credential-" + "b".repeat(40);
const firstPrevious = "Legacy-Previous-Credential-" + "c".repeat(40);
const firstPreviousUntil = new Date(nowMs + 60 * 60 * 1000).toISOString();

function digest(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function literal(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function sql(sqlText) {
  return run("psql", [
    dbUrl,
    "-X",
    "-q",
    "-t",
    "-A",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    sqlText,
  ]);
}

function baseEnv(overrides = {}) {
  return {
    SUPABASE_URL: apiUrl,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    LICENSE_ADMIN_EMERGENCY_LOGIN_ENABLED: "true",
    LICENSE_ADMIN_EMERGENCY_ACTOR_EMAIL: actorEmail,
    LICENSE_ADMIN_EMERGENCY_ACTOR_NAME: actorName,
    LICENSE_API_SECRET: firstCurrent,
    LICENSE_API_SECRET_PREVIOUS: firstPrevious,
    LICENSE_API_SECRET_PREVIOUS_VALID_UNTIL: firstPreviousUntil,
    ...overrides,
  };
}

sql(
  "delete from public.license_admin_audit_log where action='admin.emergency.authority_sync';" +
  "delete from license_private.admin_emergency_runtime_config;" +
  "delete from license_private.admin_emergency_credentials;",
);

const built = buildLegacyEmergencySyncPayload(baseEnv(), nowMs);
assert.equal(built.ready, true);
assert.equal(built.payload.p_current_sha256, digest(firstCurrent));
assert.equal(built.payload.p_previous_sha256, digest(firstPrevious));
assert.equal(built.payload.p_previous_valid_until, firstPreviousUntil);
assert.equal(built.payload.p_enabled, true);
assert.equal(JSON.stringify(built).includes(firstCurrent), false);
assert.equal(JSON.stringify(built).includes(firstPrevious), false);

const first = await syncLegacyEmergencyAuthority({
  env: baseEnv(),
  nowMs,
});
assert.equal(first.ok, true, JSON.stringify(first));
assert.equal(first.status, "synced");
assert.equal(first.changed, true);
assert.equal(first.enabled, true);
assert.equal(first.previousActive, true);
assert.equal(JSON.stringify(first).includes(firstCurrent), false);

const snapshot1 = JSON.parse(
  sql(
    "select json_build_object(" +
      "'current_hash',(select secret_sha256 from license_private.admin_emergency_credentials where slot='current')," +
      "'previous_hash',(select secret_sha256 from license_private.admin_emergency_credentials where slot='previous')," +
      "'previous_until',(select valid_until from license_private.admin_emergency_credentials where slot='previous')," +
      "'enabled',(select enabled from license_private.admin_emergency_runtime_config where id='primary')," +
      "'actor_email',(select actor_email from license_private.admin_emergency_runtime_config where id='primary')," +
      "'display_name',(select display_name from license_private.admin_emergency_runtime_config where id='primary')," +
      "'audit_count',(select count(*) from public.license_admin_audit_log where action='admin.emergency.authority_sync')" +
    ")::text;",
  ),
);
assert.equal(snapshot1.current_hash, digest(firstCurrent));
assert.equal(snapshot1.previous_hash, digest(firstPrevious));
assert.equal(new Date(snapshot1.previous_until).toISOString(), firstPreviousUntil);
assert.equal(snapshot1.enabled, true);
assert.equal(snapshot1.actor_email, actorEmail);
assert.equal(snapshot1.display_name, actorName);
assert.equal(Number(snapshot1.audit_count), 1);

const second = await syncLegacyEmergencyAuthority({
  env: baseEnv(),
  nowMs,
});
assert.equal(second.ok, true);
assert.equal(second.status, "synced");
assert.equal(second.changed, false);
assert.equal(
  Number(sql("select count(*) from public.license_admin_audit_log where action='admin.emergency.authority_sync';")),
  1,
  "Idempotent sync must not create duplicate audit noise.",
);

const missingCurrent = await syncLegacyEmergencyAuthority({
  env: baseEnv({ LICENSE_API_SECRET: "" }),
  nowMs,
});
assert.deepEqual(missingCurrent, {
  ok: true,
  status: "skipped",
  reason: "current-not-configured",
});
assert.equal(
  sql("select secret_sha256 from license_private.admin_emergency_credentials where slot='current';"),
  digest(firstCurrent),
  "Missing current environment configuration must never clear the valid current authority.",
);

const invalidActor = await syncLegacyEmergencyAuthority({
  env: baseEnv({ LICENSE_ADMIN_EMERGENCY_ACTOR_EMAIL: "not-an-email" }),
  nowMs,
});
assert.deepEqual(invalidActor, {
  ok: true,
  status: "skipped",
  reason: "actor-not-configured",
});
assert.equal(
  sql("select secret_sha256 from license_private.admin_emergency_credentials where slot='current';"),
  digest(firstCurrent),
);

const rotationUntil = new Date(nowMs + 2 * 60 * 60 * 1000).toISOString();
const rotated = await syncLegacyEmergencyAuthority({
  env: baseEnv({
    LICENSE_API_SECRET: rotatedCurrent,
    LICENSE_API_SECRET_PREVIOUS: firstCurrent,
    LICENSE_API_SECRET_PREVIOUS_VALID_UNTIL: rotationUntil,
  }),
  nowMs,
});
assert.equal(rotated.ok, true, JSON.stringify(rotated));
assert.equal(rotated.changed, true);
assert.equal(rotated.previousActive, true);

const snapshot2 = JSON.parse(
  sql(
    "select json_build_object(" +
      "'current_hash',(select secret_sha256 from license_private.admin_emergency_credentials where slot='current')," +
      "'previous_hash',(select secret_sha256 from license_private.admin_emergency_credentials where slot='previous')," +
      "'previous_until',(select valid_until from license_private.admin_emergency_credentials where slot='previous')" +
    ")::text;",
  ),
);
assert.equal(snapshot2.current_hash, digest(rotatedCurrent));
assert.equal(snapshot2.previous_hash, digest(firstCurrent));
assert.equal(new Date(snapshot2.previous_until).toISOString(), rotationUntil);

const rollbackUntil = new Date(nowMs + 3 * 60 * 60 * 1000).toISOString();
const rollback = await syncLegacyEmergencyAuthority({
  env: baseEnv({
    LICENSE_API_SECRET: firstCurrent,
    LICENSE_API_SECRET_PREVIOUS: rotatedCurrent,
    LICENSE_API_SECRET_PREVIOUS_VALID_UNTIL: rollbackUntil,
  }),
  nowMs,
});
assert.equal(rollback.ok, true, JSON.stringify(rollback));
assert.equal(
  sql("select secret_sha256 from license_private.admin_emergency_credentials where slot='current';"),
  digest(firstCurrent),
);
assert.equal(
  sql("select secret_sha256 from license_private.admin_emergency_credentials where slot='previous';"),
  digest(rotatedCurrent),
);

const beyondGrace = new Date(nowMs + 25 * 60 * 60 * 1000).toISOString();
const bounded = await syncLegacyEmergencyAuthority({
  env: baseEnv({
    LICENSE_API_SECRET: firstCurrent,
    LICENSE_API_SECRET_PREVIOUS: firstPrevious,
    LICENSE_API_SECRET_PREVIOUS_VALID_UNTIL: beyondGrace,
  }),
  nowMs,
});
assert.equal(bounded.ok, true, JSON.stringify(bounded));
assert.equal(bounded.previousActive, false);
assert.equal(
  Number(sql("select count(*) from license_private.admin_emergency_credentials where slot='previous';")),
  0,
  "A previous credential outside the existing 24-hour legacy grace must not remain active.",
);

const disabled = await syncLegacyEmergencyAuthority({
  env: baseEnv({
    LICENSE_ADMIN_EMERGENCY_LOGIN_ENABLED: "false",
    LICENSE_API_SECRET_PREVIOUS: "",
    LICENSE_API_SECRET_PREVIOUS_VALID_UNTIL: "",
  }),
  nowMs,
});
assert.equal(disabled.ok, true);
assert.equal(disabled.enabled, false);
assert.equal(
  sql("select enabled::text from license_private.admin_emergency_runtime_config where id='primary';"),
  "false",
);

let remoteFetchCalled = false;
const remoteHttp = await syncLegacyEmergencyAuthority({
  env: baseEnv({
    SUPABASE_URL: "http://example.test",
  }),
  fetchImpl: async () => {
    remoteFetchCalled = true;
    throw new Error("must not run");
  },
  nowMs,
});
assert.deepEqual(remoteHttp, {
  ok: true,
  status: "skipped",
  reason: "database-not-configured",
});
assert.equal(remoteFetchCalled, false);

const grants = JSON.parse(
  sql(
    "select json_build_object(" +
      "'anon_exec',has_function_privilege('anon','public.sync_license_admin_emergency_authority(text,text,timestamptz,boolean,text,text)','EXECUTE')," +
      "'auth_exec',has_function_privilege('authenticated','public.sync_license_admin_emergency_authority(text,text,timestamptz,boolean,text,text)','EXECUTE')," +
      "'service_exec',has_function_privilege('service_role','public.sync_license_admin_emergency_authority(text,text,timestamptz,boolean,text,text)','EXECUTE')," +
      "'anon_config_select',has_table_privilege('anon','license_private.admin_emergency_runtime_config','SELECT')," +
      "'service_config_select',has_table_privilege('service_role','license_private.admin_emergency_runtime_config','SELECT')" +
    ")::text;",
  ),
);
assert.equal(grants.anon_exec, false);
assert.equal(grants.auth_exec, false);
assert.equal(grants.service_exec, true);
assert.equal(grants.anon_config_select, false);
assert.equal(grants.service_config_select, false);

const auditLeakCount = Number(
  sql(
    "select count(*) from public.license_admin_audit_log " +
    "where action='admin.emergency.authority_sync' and (" +
      "details::text like " + literal("%" + firstCurrent + "%") +
      " or details::text like " + literal("%" + digest(firstCurrent) + "%") +
      " or details::text like " + literal("%" + rotatedCurrent + "%") +
      " or details::text like " + literal("%" + digest(rotatedCurrent) + "%") +
    ");",
  ),
);
assert.equal(auditLeakCount, 0);

const startup = run(
  process.execPath,
  ["apps/license-admin/scripts/sync-emergency-authority.mjs"],
  {
    env: {
      ...process.env,
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      SUPABASE_SECRET_KEY: "",
      LICENSE_API_SECRET: "",
    },
  },
);
assert.match(startup, /skipped safely/);

console.log(
  "Legacy emergency authority sync E2E PASS: digest-only service-role sync -> idempotence -> rotation/rollback -> 24h bound -> safe skip -> private grants.",
);
