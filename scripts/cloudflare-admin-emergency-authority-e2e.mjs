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
const actorEmail = "emergency-operator@example.test";
const displayName = "Emergency E2E Operator";
const sessionToken = "s".repeat(48);
const tokenHash = createHash("sha256").update(sessionToken).digest("hex");
const edgeHash = createHash("sha256").update(edgeSecret).digest("hex");

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
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

sql(
  "insert into license_private.edge_credentials (id, secret_sha256, active) values (" +
    literal("emergency-e2e") +
    ", " +
    literal(edgeHash) +
    ", true) on conflict (id) do update set secret_sha256=excluded.secret_sha256, active=true;",
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

const badSecret = await rpc("cloudflare_admin_emergency_preflight", {
  p_edge_secret: "x".repeat(48),
  p_rate_key_hash: digest("bad-rate"),
  p_backoff_key_hash: digest("bad-backoff"),
});
assert.equal(badSecret.ok, false);
assert.equal(badSecret.code, "EMERGENCY_SERVICE_UNAVAILABLE");

const rateKey = digest("203.0.113.10|" + edgeSecret);
const backoffKey = digest("203.0.113.10|" + actorEmail + "|" + edgeSecret);

const initial = await rpc("cloudflare_admin_emergency_preflight", {
  p_edge_secret: edgeSecret,
  p_rate_key_hash: rateKey,
  p_backoff_key_hash: backoffKey,
});
assert.equal(initial.ok, true);
assert.equal(initial.allowed, true);

const failed = await rpc("cloudflare_admin_emergency_record_failure", {
  p_edge_secret: edgeSecret,
  p_backoff_key_hash: backoffKey,
  p_actor_email: actorEmail,
  p_display_name: displayName,
});
assert.equal(failed.ok, true);
assert.equal(failed.allowed, false);
assert.equal(failed.failureCount, 1);
assert.ok(failed.retryAfterSeconds >= 2);

const blocked = await rpc("cloudflare_admin_emergency_preflight", {
  p_edge_secret: edgeSecret,
  p_rate_key_hash: rateKey,
  p_backoff_key_hash: backoffKey,
});
assert.equal(blocked.ok, true);
assert.equal(blocked.allowed, false);
assert.equal(blocked.code, "RATE_LIMITED");

const opened = await rpc("cloudflare_admin_emergency_open_session", {
  p_edge_secret: edgeSecret,
  p_backoff_key_hash: backoffKey,
  p_token_sha256: tokenHash,
  p_actor_email: actorEmail,
  p_display_name: displayName,
});
assert.equal(opened.ok, true);
assert.equal(opened.identity.email, actorEmail);
assert.equal(opened.identity.role, "admin");
assert.equal(opened.identity.source, "emergency");

const stored = JSON.parse(
  sql(
    "select json_build_object(" +
      "'digest_count',(select count(*) from public.license_admin_sessions where edge_token_sha256=" +
      literal(tokenHash) +
      ")," +
      "'raw_count',(select count(*) from public.license_admin_sessions where edge_token_sha256=" +
      literal(sessionToken) +
      ")," +
      "'duration_ok',(select expires_at <= created_at + interval '15 minutes' from public.license_admin_sessions where edge_token_sha256=" +
      literal(tokenHash) +
      " limit 1)" +
      ")::text;",
  ),
);
assert.equal(Number(stored.digest_count), 1);
assert.equal(Number(stored.raw_count), 0);
assert.equal(stored.duration_ok, true);

assert.equal(
  Number(sql("select count(*) from public.license_admin_login_backoff where key_hash=" + literal(backoffKey) + ";")),
  0,
);

const me = await rpc("cloudflare_admin_emergency_me", {
  p_edge_secret: edgeSecret,
  p_token_sha256: tokenHash,
});
assert.equal(me.ok, true);
assert.equal(me.sessionId, opened.sessionId);

const logout = await rpc("cloudflare_admin_emergency_logout", {
  p_edge_secret: edgeSecret,
  p_token_sha256: tokenHash,
});
assert.equal(logout.ok, true);

const afterLogout = await rpc("cloudflare_admin_emergency_me", {
  p_edge_secret: edgeSecret,
  p_token_sha256: tokenHash,
});
assert.equal(afterLogout.ok, false);
assert.equal(afterLogout.code, "UNAUTHENTICATED");

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
      " and action='admin.emergency.logout' and outcome='success')" +
      ")::text;",
  ),
);
assert.equal(Number(audit.denied), 1);
assert.equal(Number(audit.login_success), 1);
assert.equal(Number(audit.logout_success), 1);

const coarseRateKey = digest("198.51.100.77|" + edgeSecret);
for (let index = 1; index <= 8; index += 1) {
  const attempt = await rpc("cloudflare_admin_emergency_preflight", {
    p_edge_secret: edgeSecret,
    p_rate_key_hash: coarseRateKey,
    p_backoff_key_hash: digest("rate-only-" + index),
  });
  assert.equal(attempt.ok, true);
  assert.equal(attempt.allowed, true);
}
const ninth = await rpc("cloudflare_admin_emergency_preflight", {
  p_edge_secret: edgeSecret,
  p_rate_key_hash: coarseRateKey,
  p_backoff_key_hash: digest("rate-only-9"),
});
assert.equal(ninth.ok, true);
assert.equal(ninth.allowed, false);
assert.equal(ninth.code, "RATE_LIMITED");

console.log(
  "Cloudflare emergency authority foundation PASS: edge boundary -> rate/backoff -> hashed revocable session -> audit -> me/logout.",
);
