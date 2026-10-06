import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

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

const edgeSecret = "e".repeat(48);
const currentCredential = "c".repeat(48);
const previousCredential = "p".repeat(48);
const wrongCredential = "w".repeat(48);
const actorEmail = "emergency-operator@example.test";
const displayName = "Emergency E2E Operator";

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
const currentCredentialHash = digest(currentCredential);
const previousCredentialHash = digest(previousCredential);
const wrongCredentialHash = digest(wrongCredential);

sql(
  "insert into license_private.edge_credentials (id, secret_sha256, active) values (" +
    literal("emergency-e2e") +
    ", " +
    literal(edgeHash) +
    ", true) on conflict (id) do update set secret_sha256=excluded.secret_sha256, active=true;" +
  "delete from license_private.admin_emergency_credentials;" +
  "insert into license_private.admin_emergency_credentials (slot,secret_sha256,active,created_at,valid_until) values " +
    "('current'," + literal(currentCredentialHash) + ",true,now(),null)," +
    "('previous'," + literal(previousCredentialHash) + ",true,now(),now()+interval '1 hour');",
);

async function rpc(name, body) {
  const response = await fetch(apiUrl + "/rest/v1/rpc/" + encodeURIComponent(name), {
    method: "POST",
    headers: {
      accept: "application/json",
      apikey: publishableKey,
      authorization: "Bearer " + publishableKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  const data = await response.json().catch(() => null);
  assert.equal(response.status, 200, name + " must use the JSON authority contract.");
  assert.ok(data && typeof data === "object" && !Array.isArray(data));
  return data;
}

function loginBody({
  edge = edgeSecret,
  credentialHash = currentCredentialHash,
  rateKey = digest("203.0.113.10|" + edgeSecret),
  backoffKey = digest("203.0.113.10|" + actorEmail + "|" + edgeSecret),
  tokenHash = digest("session-default"),
  email = actorEmail,
  name = displayName,
} = {}) {
  return {
    p_edge_secret: edge,
    p_credential_sha256: credentialHash,
    p_rate_key_hash: rateKey,
    p_backoff_key_hash: backoffKey,
    p_token_sha256: tokenHash,
  };
}

const badEdge = await rpc("cloudflare_admin_emergency_login_v2", loginBody({
  edge: "x".repeat(48),
  tokenHash: digest("bad-edge-session"),
}));
assert.equal(badEdge.ok, false);
assert.equal(badEdge.code, "EMERGENCY_SERVICE_UNAVAILABLE");

const deniedRateKey = digest("203.0.113.11|" + edgeSecret);
const deniedBackoffKey = digest("203.0.113.11|" + actorEmail + "|" + edgeSecret);
const denied = await rpc("cloudflare_admin_emergency_login_v2", loginBody({
  credentialHash: wrongCredentialHash,
  rateKey: deniedRateKey,
  backoffKey: deniedBackoffKey,
  tokenHash: digest("denied-session"),
}));
assert.equal(denied.ok, false, JSON.stringify(denied));
assert.equal(denied.code, "INVALID_EMERGENCY_CREDENTIAL");
assert.equal(denied.failureCount, 1);
assert.ok(denied.retryAfterSeconds >= 2);

const blocked = await rpc("cloudflare_admin_emergency_login_v2", loginBody({
  credentialHash: currentCredentialHash,
  rateKey: deniedRateKey,
  backoffKey: deniedBackoffKey,
  tokenHash: digest("blocked-session"),
}));
assert.equal(blocked.ok, false);
assert.equal(blocked.code, "RATE_LIMITED");
assert.equal(blocked.failureCount, 1);

const currentToken = "current-browser-session-token-" + "s".repeat(32);
const currentTokenHash = digest(currentToken);
const currentBackoffKey = digest("203.0.113.12|" + actorEmail + "|" + edgeSecret);
const currentLogin = await rpc("cloudflare_admin_emergency_login_v2", loginBody({
  credentialHash: currentCredentialHash,
  rateKey: digest("203.0.113.12|" + edgeSecret),
  backoffKey: currentBackoffKey,
  tokenHash: currentTokenHash,
}));
assert.equal(currentLogin.ok, true, JSON.stringify(currentLogin));
assert.equal(currentLogin.credentialMatch, "current");
assert.equal(currentLogin.identity.email, actorEmail);
assert.equal(currentLogin.identity.role, "admin");
assert.equal(currentLogin.identity.source, "emergency");

const storedCurrent = JSON.parse(
  sql(
    "select json_build_object(" +
      "'digest_count',(select count(*) from public.license_admin_sessions where edge_token_sha256=" +
      literal(currentTokenHash) +
      ")," +
      "'raw_count',(select count(*) from public.license_admin_sessions where edge_token_sha256=" +
      literal(currentToken) +
      ")," +
      "'duration_ok',(select expires_at <= created_at + interval '15 minutes' from public.license_admin_sessions where edge_token_sha256=" +
      literal(currentTokenHash) +
      " limit 1)" +
      ")::text;",
  ),
);
assert.equal(Number(storedCurrent.digest_count), 1);
assert.equal(Number(storedCurrent.raw_count), 0);
assert.equal(storedCurrent.duration_ok, true);

const currentMe = await rpc("cloudflare_admin_emergency_me", {
  p_edge_secret: edgeSecret,
  p_token_sha256: currentTokenHash,
});
assert.equal(currentMe.ok, true);
assert.equal(currentMe.sessionId, currentLogin.sessionId);

const currentLogout = await rpc("cloudflare_admin_emergency_logout", {
  p_edge_secret: edgeSecret,
  p_token_sha256: currentTokenHash,
});
assert.equal(currentLogout.ok, true);

const currentAfterLogout = await rpc("cloudflare_admin_emergency_me", {
  p_edge_secret: edgeSecret,
  p_token_sha256: currentTokenHash,
});
assert.equal(currentAfterLogout.ok, false);
assert.equal(currentAfterLogout.code, "UNAUTHENTICATED");

const previousTokenHash = digest("previous-browser-session-token-" + "q".repeat(32));
const previousLogin = await rpc("cloudflare_admin_emergency_login_v2", loginBody({
  credentialHash: previousCredentialHash,
  rateKey: digest("203.0.113.13|" + edgeSecret),
  backoffKey: digest("203.0.113.13|" + actorEmail + "|" + edgeSecret),
  tokenHash: previousTokenHash,
}));
assert.equal(previousLogin.ok, true, JSON.stringify(previousLogin));
assert.equal(previousLogin.credentialMatch, "previous");

const previousLogout = await rpc("cloudflare_admin_emergency_logout", {
  p_edge_secret: edgeSecret,
  p_token_sha256: previousTokenHash,
});
assert.equal(previousLogout.ok, true);

const coarseEmail = "emergency-rate-limit@example.test";
const coarseRateKey = digest("198.51.100.77|" + edgeSecret);
for (let index = 1; index <= 8; index += 1) {
  const attempt = await rpc("cloudflare_admin_emergency_login_v2", loginBody({
    credentialHash: wrongCredentialHash,
    rateKey: coarseRateKey,
    backoffKey: digest("rate-only-" + index),
    tokenHash: digest("rate-only-token-" + index),
    email: coarseEmail,
    name: "Emergency Rate Limit Test",
  }));
  assert.equal(attempt.ok, false);
  assert.equal(attempt.code, "INVALID_EMERGENCY_CREDENTIAL");
}
const ninth = await rpc("cloudflare_admin_emergency_login_v2", loginBody({
  credentialHash: wrongCredentialHash,
  rateKey: coarseRateKey,
  backoffKey: digest("rate-only-9"),
  tokenHash: digest("rate-only-token-9"),
  email: coarseEmail,
  name: "Emergency Rate Limit Test",
}));
assert.equal(ninth.ok, false);
assert.equal(ninth.code, "RATE_LIMITED");

const audit = JSON.parse(
  sql(
    "select json_build_object(" +
      "'denied',(select count(*) from public.license_admin_audit_log where actor_email=" +
      literal(actorEmail) +
      " and action='admin.emergency.login' and outcome='denied')," +
      "'login_success',(select count(*) from public.license_admin_audit_log where actor_email=" +
      literal(actorEmail) +
      " and action='admin.emergency.login' and outcome='success')," +
      "'logout_success',(select count(*) from public.license_admin_audit_log where actor_email=" +
      literal(actorEmail) +
      " and action='admin.emergency.logout' and outcome='success')," +
      "'current_hash_private',(select count(*) from license_private.admin_emergency_credentials where slot='current' and secret_sha256=" +
      literal(currentCredentialHash) +
      ")," +
      "'previous_hash_private',(select count(*) from license_private.admin_emergency_credentials where slot='previous' and secret_sha256=" +
      literal(previousCredentialHash) +
      ")" +
      ")::text;",
  ),
);
assert.equal(Number(audit.denied), 1);
assert.equal(Number(audit.login_success), 2);
assert.equal(Number(audit.logout_success), 2);
assert.equal(Number(audit.current_hash_private), 1);
assert.equal(Number(audit.previous_hash_private), 1);

const grants = JSON.parse(
  sql(
    "select json_build_object(" +
      "'anon_login',has_function_privilege('anon','public.cloudflare_admin_emergency_login(text,text,text,text,text,text,text)','EXECUTE')," +
      "'auth_login',has_function_privilege('authenticated','public.cloudflare_admin_emergency_login(text,text,text,text,text,text,text)','EXECUTE')," +
      "'service_login',has_function_privilege('service_role','public.cloudflare_admin_emergency_login(text,text,text,text,text,text,text)','EXECUTE')," +
      "'anon_private_table',has_table_privilege('anon','license_private.admin_emergency_credentials','SELECT')," +
      "'auth_private_table',has_table_privilege('authenticated','license_private.admin_emergency_credentials','SELECT')" +
      ")::text;",
  ),
);
assert.equal(grants.anon_login, true);
assert.equal(grants.auth_login, false);
assert.equal(grants.service_login, false);
assert.equal(grants.anon_private_table, false);
assert.equal(grants.auth_private_table, false);

console.log(
  "Cloudflare emergency authority foundation PASS: private credential proof -> rate/backoff -> hashed revocable sessions -> current/previous rotation -> audit -> me/logout.",
);
