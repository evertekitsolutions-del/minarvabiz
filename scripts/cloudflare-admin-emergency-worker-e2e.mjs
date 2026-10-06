import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import worker from "../infra/cloudflare-license-edge/src/index.js";

function run(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
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
const publishableKey = String(
  deepValue(status, "PUBLISHABLE_KEY") || deepValue(status, "ANON_KEY") || "",
).trim();
const dbUrl = String(deepValue(status, "DB_URL") || "").trim();

assert.match(apiUrl, /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/);
assert.ok(publishableKey.length >= 20);
assert.match(dbUrl, /^postgres(?:ql)?:\/\//);

const adminOrigin = "http://127.0.0.1:3001";
const edgeSecret = "worker-emergency-edge-secret-" + "e".repeat(32);
const actorEmail = "emergency-worker@example.test";
const actorName = "Emergency Worker Operator";
const currentCredential = "Current-Emergency-Credential-" + "c".repeat(32);
const previousCredential = "Previous-Emergency-Credential-" + "p".repeat(32);
const wrongCredential = "Wrong-Emergency-Credential-" + "w".repeat(32);

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

const edgeHash = digest(edgeSecret);
const currentHash = digest(currentCredential);
const previousHash = digest(previousCredential);

sql(
  "delete from public.license_admin_audit_log where source='emergency';" +
  "delete from public.license_admin_sessions where source='emergency';" +
  "delete from public.license_admin_login_backoff;" +
  "delete from public.license_api_rate_limits where bucket='admin-emergency-login';" +
  "delete from license_private.admin_emergency_runtime_config;" +
  "delete from license_private.admin_emergency_credentials;" +
  "insert into license_private.edge_credentials (id,secret_sha256,active) values (" +
    literal("emergency-worker-e2e") + "," + literal(edgeHash) + ",true) " +
    "on conflict (id) do update set secret_sha256=excluded.secret_sha256,active=true;" +
  "insert into license_private.admin_emergency_credentials " +
    "(slot,secret_sha256,active,created_at,valid_until) values " +
    "('current'," + literal(currentHash) + ",true,now(),null)," +
    "('previous'," + literal(previousHash) + ",true,now(),now()+interval '1 hour');" +
  "insert into license_private.admin_emergency_runtime_config " +
    "(id,enabled,actor_email,display_name,source,updated_at) values (" +
    "'primary',true," + literal(actorEmail) + "," + literal(actorName) + ",'manual',now());",
);

const baseEnv = {
  SUPABASE_URL: apiUrl,
  SUPABASE_PUBLISHABLE_KEY: publishableKey,
  LICENSE_EDGE_RPC_SECRET: edgeSecret,
  LICENSE_ADMIN_ALLOWED_ORIGINS: adminOrigin,
  MINARVA_ONLINE_APP_URL: "http://127.0.0.1:3000",
};

async function workerJson(path, options = {}) {
  const headers = new Headers({
    accept: "application/json",
    origin: options.origin === undefined ? adminOrigin : options.origin,
  });
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.token) headers.set("authorization", "Bearer " + options.token);
  if (options.ip) headers.set("cf-connecting-ip", options.ip);

  const response = await worker.fetch(
    new Request("https://worker.local" + path, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
    { ...baseEnv, ...(options.env || {}) },
  );
  return {
    status: response.status,
    headers: response.headers,
    data: await response.json().catch(() => null),
  };
}

sql(
  "update license_private.admin_emergency_runtime_config set enabled=false,updated_at=now() where id='primary';",
);
const disabled = await workerJson("/api/admin/emergency/status");
assert.equal(disabled.status, 200);
assert.equal(disabled.data.ok, true);
assert.equal(disabled.data.enabled, false);
assert.equal(disabled.data.configured, false);
assert.equal(JSON.stringify(disabled.data).includes(actorEmail), false);

const badOrigin = await workerJson("/api/admin/emergency/status", {
  origin: "https://evil.example.test",
});
assert.equal(badOrigin.status, 403);
assert.equal(badOrigin.data.code, "ORIGIN_NOT_ALLOWED");
assert.equal(badOrigin.headers.get("access-control-allow-origin"), null);

sql(
  "delete from license_private.admin_emergency_runtime_config where id='primary';",
);
const unconfiguredActor = await workerJson("/api/admin/emergency/status");
assert.equal(unconfiguredActor.status, 200);
assert.equal(unconfiguredActor.data.ok, true);
assert.equal(unconfiguredActor.data.enabled, false);
assert.equal(unconfiguredActor.data.configured, false);

sql(
  "insert into license_private.admin_emergency_runtime_config " +
    "(id,enabled,actor_email,display_name,source,updated_at) values (" +
    "'primary',true," + literal(actorEmail) + "," + literal(actorName) + ",'manual',now());",
);
const configured = await workerJson("/api/admin/emergency/status");
assert.equal(configured.status, 200, JSON.stringify(configured.data));
assert.equal(configured.data.ok, true);
assert.equal(configured.data.enabled, true);
assert.equal(configured.data.configured, true);
assert.equal(configured.data.previousCredentialGraceActive, true);
assert.equal(configured.headers.get("access-control-allow-origin"), adminOrigin);
assert.equal(JSON.stringify(configured.data).includes(actorEmail), false);
assert.equal(JSON.stringify(configured.data).includes(currentHash), false);

sql(
  "update license_private.admin_emergency_runtime_config set enabled=false,updated_at=now() where id='primary';",
);
const disabledLogin = await workerJson("/api/admin/emergency/login", {
  method: "POST",
  body: { credential: currentCredential },
  ip: "203.0.113.1",
});
assert.equal(disabledLogin.status, 403);
assert.equal(disabledLogin.data.code, "EMERGENCY_DISABLED");
sql(
  "update license_private.admin_emergency_runtime_config set enabled=true,updated_at=now() where id='primary';",
);

const badLoginOrigin = await workerJson("/api/admin/emergency/login", {
  method: "POST",
  body: { credential: currentCredential },
  origin: "https://evil.example.test",
  ip: "203.0.113.2",
});
assert.equal(badLoginOrigin.status, 403);
assert.equal(badLoginOrigin.data.code, "ORIGIN_NOT_ALLOWED");

const invalid = await workerJson("/api/admin/emergency/login", {
  method: "POST",
  body: { credential: wrongCredential },
  ip: "203.0.113.10",
});
assert.equal(invalid.status, 401, JSON.stringify(invalid.data));
assert.equal(invalid.data.code, "INVALID_EMERGENCY_CREDENTIAL");
assert.ok(Number(invalid.data.retryAfterSeconds) >= 2);
assert.ok(Number(invalid.headers.get("retry-after")) >= 2);

const blockedCorrect = await workerJson("/api/admin/emergency/login", {
  method: "POST",
  body: { credential: currentCredential },
  ip: "203.0.113.10",
});
assert.equal(blockedCorrect.status, 429);
assert.equal(blockedCorrect.data.code, "RATE_LIMITED");

const currentLogin = await workerJson("/api/admin/emergency/login", {
  method: "POST",
  body: { credential: currentCredential },
  ip: "203.0.113.11",
});
assert.equal(currentLogin.status, 200, JSON.stringify(currentLogin.data));
assert.equal(currentLogin.data.ok, true);
assert.equal(currentLogin.data.identity.email, actorEmail);
assert.equal(currentLogin.data.identity.displayName, actorName);
assert.equal(currentLogin.data.identity.role, "admin");
assert.equal(currentLogin.data.identity.source, "emergency");
assert.match(currentLogin.data.sessionToken, /^[A-Za-z0-9_-]{64}$/);
assert.equal("credentialMatch" in currentLogin.data, false);
assert.equal(JSON.stringify(currentLogin.data).includes(currentCredential), false);

const currentToken = currentLogin.data.sessionToken;
const currentTokenHash = digest(currentToken);
const stored = JSON.parse(
  sql(
    "select json_build_object(" +
      "'digest_count',(select count(*) from public.license_admin_sessions where edge_token_sha256=" +
      literal(currentTokenHash) + ")," +
      "'raw_count',(select count(*) from public.license_admin_sessions where edge_token_sha256=" +
      literal(currentToken) + ")," +
      "'audit_raw_token_count',(select count(*) from public.license_admin_audit_log " +
      "where details::text like " + literal("%" + currentToken + "%") + ")," +
      "'duration_ok',(select expires_at <= created_at + interval '15 minutes' " +
      "from public.license_admin_sessions where edge_token_sha256=" +
      literal(currentTokenHash) + " limit 1)" +
    ")::text;",
  ),
);
assert.equal(Number(stored.digest_count), 1);
assert.equal(Number(stored.raw_count), 0);
assert.equal(Number(stored.audit_raw_token_count), 0);
assert.equal(stored.duration_ok, true);

const me = await workerJson("/api/admin/emergency/me", { token: currentToken });
assert.equal(me.status, 200, JSON.stringify(me.data));
assert.equal(me.data.ok, true);
assert.equal(me.data.identity.email, actorEmail);
assert.equal(me.data.identity.role, "admin");
assert.equal("sessionToken" in me.data, false);

const directNoProof = await fetch(apiUrl + "/rest/v1/rpc/cloudflare_admin_me", {
  method: "POST",
  headers: {
    apikey: publishableKey,
    authorization: "Bearer " + publishableKey,
    "content-type": "application/json",
  },
  body: "{}",
});
assert.equal(directNoProof.status, 200);
const directNoProofData = await directNoProof.json();
assert.equal(directNoProofData.ok, false);
assert.equal(directNoProofData.code, "UNAUTHENTICATED");

const directTokenOnly = await fetch(apiUrl + "/rest/v1/rpc/cloudflare_admin_me", {
  method: "POST",
  headers: {
    apikey: publishableKey,
    authorization: "Bearer " + publishableKey,
    "content-type": "application/json",
    "x-minarva-emergency-token-sha256": currentTokenHash,
  },
  body: "{}",
});
assert.equal(directTokenOnly.status, 200);
const directTokenOnlyData = await directTokenOnly.json();
assert.equal(directTokenOnlyData.ok, false);
assert.equal(directTokenOnlyData.code, "UNAUTHENTICATED");

const generalMe = await workerJson("/api/admin/me", { token: currentToken });
assert.equal(generalMe.status, 200, JSON.stringify(generalMe.data));
assert.equal(generalMe.data.ok, true);
assert.equal(generalMe.data.identity.email, actorEmail);
assert.equal(generalMe.data.identity.role, "admin");
assert.equal(generalMe.data.identity.source, "emergency");
assert.equal(generalMe.headers.get("x-minarva-admin-data"), "supabase-emergency-rpc");

const generalBadOrigin = await workerJson("/api/admin/licenses", {
  token: currentToken,
  origin: "https://evil.example.test",
});
assert.equal(generalBadOrigin.status, 403);
assert.equal(generalBadOrigin.data.code, "ORIGIN_NOT_ALLOWED");

sql(
  "update license_private.admin_emergency_runtime_config set enabled=false,updated_at=now() where id='primary';",
);
const generalDisabled = await workerJson("/api/admin/licenses", {
  token: currentToken,
});
assert.equal(generalDisabled.status, 401);
assert.equal(generalDisabled.data.code, "UNAUTHENTICATED");
sql(
  "update license_private.admin_emergency_runtime_config set enabled=true,updated_at=now() where id='primary';",
);

const beforeLicenses = await workerJson("/api/admin/licenses", { token: currentToken });
assert.equal(beforeLicenses.status, 200, JSON.stringify(beforeLicenses.data));
assert.equal(beforeLicenses.data.ok, true);
assert.ok(Array.isArray(beforeLicenses.data.licenses));

const issued = await workerJson("/api/admin/licenses", {
  method: "POST",
  token: currentToken,
  body: {
    customerName: "Emergency Authority Customer",
    plan: "professional",
    edition: "hybrid",
    activationLimit: 2,
  },
});
assert.equal(issued.status, 200, JSON.stringify(issued.data));
assert.equal(issued.data.ok, true);
assert.match(String(issued.data.token || ""), /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
const issuedLicenseId = String(issued.data.license?.licenseId || "");
assert.ok(issuedLicenseId.length >= 10);

const afterLicenses = await workerJson("/api/admin/licenses", { token: currentToken });
assert.equal(afterLicenses.status, 200, JSON.stringify(afterLicenses.data));
assert.ok(
  afterLicenses.data.licenses.some((row) => String(row?.license_id || "") === issuedLicenseId),
);

const suspended = await workerJson("/api/admin/licenses/status", {
  method: "PATCH",
  token: currentToken,
  body: { licenseId: issuedLicenseId, status: "suspended" },
});
assert.equal(suspended.status, 200, JSON.stringify(suspended.data));
assert.equal(suspended.data.ok, true);

const reactivated = await workerJson("/api/admin/licenses/status", {
  method: "PATCH",
  token: currentToken,
  body: { licenseId: issuedLicenseId, status: "active" },
});
assert.equal(reactivated.status, 200, JSON.stringify(reactivated.data));
assert.equal(reactivated.data.ok, true);

const offline = await workerJson("/api/admin/licenses/offline-activation", {
  method: "POST",
  token: currentToken,
  body: { licenseId: issuedLicenseId, deviceId: "a".repeat(64) },
});
assert.equal(offline.status, 200, JSON.stringify(offline.data));
assert.equal(offline.data.ok, true);
assert.match(String(offline.data.filename || ""), /\.lic$/);
assert.ok(String(offline.data.content || "").includes(issuedLicenseId));

const supportId = "11111111-1111-4111-8111-111111111111";
sql(
  "insert into public.support_requests (id,request_type,status,priority,title,description) values (" +
    literal(supportId) + "::uuid,'bug','new','normal','Emergency parity test','Emergency parity request')" +
    " on conflict (id) do update set status='new',assigned_to=null,admin_notes=null,updated_at=now();",
);

const support = await workerJson("/api/admin/support", { token: currentToken });
assert.equal(support.status, 200, JSON.stringify(support.data));
assert.equal(support.data.ok, true);
assert.ok(support.data.requests.some((row) => String(row?.id || "") === supportId));

const supportUpdated = await workerJson("/api/admin/support", {
  method: "PATCH",
  token: currentToken,
  body: {
    id: supportId,
    status: "in_review",
    assignedTo: actorEmail,
    adminNotes: "Emergency bearer parity verified.",
  },
});
assert.equal(supportUpdated.status, 200, JSON.stringify(supportUpdated.data));
assert.equal(supportUpdated.data.ok, true);

const provisionEmail = "emergency-worker-provision@example.test";
const provisioned = await workerJson("/api/admin/customers/provision", {
  method: "POST",
  token: currentToken,
  body: {
    shopName: "Emergency Worker Shop",
    adminName: "Emergency Customer Admin",
    email: provisionEmail,
  },
});
assert.equal(
  provisioned.status,
  200,
  JSON.stringify({
    data: provisioned.data,
    stage: provisioned.headers.get("x-minarva-admin-upstream-stage"),
    upstreamStatus: provisioned.headers.get("x-minarva-admin-upstream-status"),
    upstreamCode: provisioned.headers.get("x-minarva-admin-upstream-code"),
  }),
);
assert.equal(provisioned.data.ok, true);
assert.equal(provisioned.data.email, provisionEmail);
assert.match(String(provisioned.data.userId || ""), /^[0-9a-f-]{36}$/i);
assert.match(String(provisioned.data.orgId || ""), /^[0-9a-f-]{36}$/i);

const emergencySessionId = sql(
  "select id::text from public.license_admin_sessions where edge_token_sha256=" +
    literal(currentTokenHash) + " limit 1;",
);
assert.match(emergencySessionId, /^[0-9a-f-]{36}$/i);

const parityAudit = JSON.parse(
  sql(
    "select json_build_object(" +
      "'wrong_source',(select count(*) from public.license_admin_audit_log where session_id=" +
        literal(emergencySessionId) + "::uuid and source<>'emergency')," +
      "'license_issue',(select count(*) from public.license_admin_audit_log where session_id=" +
        literal(emergencySessionId) + "::uuid and source='emergency' and action='license.issue')," +
      "'license_status',(select count(*) from public.license_admin_audit_log where session_id=" +
        literal(emergencySessionId) + "::uuid and source='emergency' and action='license.status_change')," +
      "'offline',(select count(*) from public.license_admin_audit_log where session_id=" +
        literal(emergencySessionId) + "::uuid and source='emergency' and action='license.offline_activate')," +
      "'support',(select count(*) from public.license_admin_audit_log where session_id=" +
        literal(emergencySessionId) + "::uuid and source='emergency' and action='support.request.update')," +
      "'provision',(select count(*) from public.license_admin_audit_log where session_id=" +
        literal(emergencySessionId) + "::uuid and source='emergency' and action='online_customer.provision')" +
    ")::text;",
  ),
);
assert.equal(Number(parityAudit.wrong_source), 0);
assert.equal(Number(parityAudit.license_issue), 1);
assert.ok(Number(parityAudit.license_status) >= 2);
assert.equal(Number(parityAudit.offline), 1);
assert.equal(Number(parityAudit.support), 1);
assert.ok(Number(parityAudit.provision) >= 2);

const meBadOrigin = await workerJson("/api/admin/emergency/me", {
  token: currentToken,
  origin: "https://evil.example.test",
});
assert.equal(meBadOrigin.status, 403);
assert.equal(meBadOrigin.data.code, "ORIGIN_NOT_ALLOWED");

const noToken = await workerJson("/api/admin/emergency/me");
assert.equal(noToken.status, 401);
assert.equal(noToken.data.code, "UNAUTHENTICATED");

const logout = await workerJson("/api/admin/emergency/logout", {
  method: "POST",
  token: currentToken,
});
assert.equal(logout.status, 200);
assert.deepEqual(logout.data, { ok: true });

const afterLogout = await workerJson("/api/admin/emergency/me", { token: currentToken });
assert.equal(afterLogout.status, 401);
assert.equal(afterLogout.data.code, "UNAUTHENTICATED");

const generalAfterLogout = await workerJson("/api/admin/me", { token: currentToken });
assert.equal(generalAfterLogout.status, 401);
assert.equal(generalAfterLogout.data.code, "UNAUTHENTICATED");

const previousLogin = await workerJson("/api/admin/emergency/login", {
  method: "POST",
  body: { credential: previousCredential },
  ip: "203.0.113.12",
});
assert.equal(previousLogin.status, 200, JSON.stringify(previousLogin.data));
assert.equal(previousLogin.data.ok, true);
assert.equal("credentialMatch" in previousLogin.data, false);
await workerJson("/api/admin/emergency/logout", {
  method: "POST",
  token: previousLogin.data.sessionToken,
});

sql(
  "update license_private.admin_emergency_credentials " +
  "set created_at=now()-interval '2 hours',valid_until=now()-interval '1 hour' " +
  "where slot='previous';",
);
const expiredStatus = await workerJson("/api/admin/emergency/status");
assert.equal(expiredStatus.status, 200);
assert.equal(expiredStatus.data.previousCredentialGraceActive, false);

const expiredPrevious = await workerJson("/api/admin/emergency/login", {
  method: "POST",
  body: { credential: previousCredential },
  ip: "203.0.113.13",
});
assert.equal(expiredPrevious.status, 401);
assert.equal(expiredPrevious.data.code, "INVALID_EMERGENCY_CREDENTIAL");

const hashAsCredential = await workerJson("/api/admin/emergency/login", {
  method: "POST",
  body: { credential: currentHash },
  ip: "203.0.113.14",
});
assert.equal(hashAsCredential.status, 401);
assert.equal(hashAsCredential.data.code, "INVALID_EMERGENCY_CREDENTIAL");

const rateIp = "198.51.100.77";
const backoffKey = digest(
  "minarva-emergency-backoff-v2\0" + rateIp + "\0" + edgeSecret,
);
for (let index = 1; index <= 8; index += 1) {
  const attempt = await workerJson("/api/admin/emergency/login", {
    method: "POST",
    body: { credential: wrongCredential + index },
    ip: rateIp,
  });
  assert.equal(attempt.status, 401, "attempt " + index + ": " + JSON.stringify(attempt.data));
  assert.equal(attempt.data.code, "INVALID_EMERGENCY_CREDENTIAL");
  sql(
    "delete from public.license_admin_login_backoff where key_hash=" +
      literal(backoffKey) + ";",
  );
}
const ninth = await workerJson("/api/admin/emergency/login", {
  method: "POST",
  body: { credential: wrongCredential + "9" },
  ip: rateIp,
});
assert.equal(ninth.status, 429, JSON.stringify(ninth.data));
assert.equal(ninth.data.code, "RATE_LIMITED");

const oversized = await worker.fetch(
  new Request("https://worker.local/api/admin/emergency/login", {
    method: "POST",
    headers: {
      origin: adminOrigin,
      "content-type": "application/json",
    },
    body: JSON.stringify({ credential: "z".repeat(3000) }),
  }),
  baseEnv,
);
assert.equal(oversized.status, 413);

assert.equal("LICENSE_ADMIN_EMERGENCY_LOGIN_ENABLED" in baseEnv, false);
assert.equal("LICENSE_ADMIN_EMERGENCY_ACTOR_EMAIL" in baseEnv, false);
assert.equal("LICENSE_ADMIN_EMERGENCY_ACTOR_NAME" in baseEnv, false);

console.log(
  "Cloudflare emergency Worker E2E PASS: DB-owned runtime config -> strict origin -> login/backoff/rotation -> dual business authority -> license/support/provision parity -> audit/revocation.",
);
