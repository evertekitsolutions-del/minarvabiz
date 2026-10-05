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
  "delete from license_private.admin_emergency_credentials;" +
  "insert into license_private.edge_credentials (id,secret_sha256,active) values (" +
    literal("emergency-worker-e2e") + "," + literal(edgeHash) + ",true) " +
    "on conflict (id) do update set secret_sha256=excluded.secret_sha256,active=true;" +
  "insert into license_private.admin_emergency_credentials " +
    "(slot,secret_sha256,active,created_at,valid_until) values " +
    "('current'," + literal(currentHash) + ",true,now(),null)," +
    "('previous'," + literal(previousHash) + ",true,now(),now()+interval '1 hour');",
);

const baseEnv = {
  SUPABASE_URL: apiUrl,
  SUPABASE_PUBLISHABLE_KEY: publishableKey,
  LICENSE_EDGE_RPC_SECRET: edgeSecret,
  LICENSE_ADMIN_ALLOWED_ORIGINS: adminOrigin,
  LICENSE_ADMIN_EMERGENCY_LOGIN_ENABLED: "true",
  LICENSE_ADMIN_EMERGENCY_ACTOR_EMAIL: actorEmail,
  LICENSE_ADMIN_EMERGENCY_ACTOR_NAME: actorName,
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

const disabled = await workerJson("/api/admin/emergency/status", {
  env: { LICENSE_ADMIN_EMERGENCY_LOGIN_ENABLED: "false" },
});
assert.equal(disabled.status, 200);
assert.deepEqual(disabled.data, { ok: true, enabled: false, configured: false });
assert.equal(JSON.stringify(disabled.data).includes(actorEmail), false);

const badOrigin = await workerJson("/api/admin/emergency/status", {
  origin: "https://evil.example.test",
});
assert.equal(badOrigin.status, 403);
assert.equal(badOrigin.data.code, "ORIGIN_NOT_ALLOWED");
assert.equal(badOrigin.headers.get("access-control-allow-origin"), null);

const unconfiguredActor = await workerJson("/api/admin/emergency/status", {
  env: { LICENSE_ADMIN_EMERGENCY_ACTOR_EMAIL: "" },
});
assert.equal(unconfiguredActor.status, 200);
assert.deepEqual(unconfiguredActor.data, { ok: true, enabled: true, configured: false });

const configured = await workerJson("/api/admin/emergency/status");
assert.equal(configured.status, 200, JSON.stringify(configured.data));
assert.equal(configured.data.ok, true);
assert.equal(configured.data.enabled, true);
assert.equal(configured.data.configured, true);
assert.equal(configured.data.previousCredentialGraceActive, true);
assert.equal(configured.headers.get("access-control-allow-origin"), adminOrigin);
assert.equal(JSON.stringify(configured.data).includes(actorEmail), false);
assert.equal(JSON.stringify(configured.data).includes(currentHash), false);

const disabledLogin = await workerJson("/api/admin/emergency/login", {
  method: "POST",
  body: { credential: currentCredential },
  env: { LICENSE_ADMIN_EMERGENCY_LOGIN_ENABLED: "false" },
  ip: "203.0.113.1",
});
assert.equal(disabledLogin.status, 403);
assert.equal(disabledLogin.data.code, "EMERGENCY_DISABLED");

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
  "minarva-emergency-backoff-v1\0" + rateIp + "\0" + actorEmail + "\0" + edgeSecret,
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

console.log(
  "Cloudflare emergency Worker E2E PASS: strict origin -> disabled/config status -> edge-only plaintext hashing -> backoff/rate -> current/previous -> hashed revocable bearer session -> me/logout -> bypass resistance.",
);
