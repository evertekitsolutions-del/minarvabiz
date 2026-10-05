import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash, createHmac } from "node:crypto";
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
const mailpitUrl = String(
  deepValue(status, "MAILPIT_URL") || deepValue(status, "INBUCKET_URL") || "",
).replace(/\/$/, "");

assert.match(apiUrl, /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/);
assert.ok(publishableKey.length >= 20, "Local Supabase publishable key is missing.");
assert.match(dbUrl, /^postgres(?:ql)?:\/\//);
assert.match(mailpitUrl, /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/);

const edgeSecret = "minarva-first-admin-e2e-edge-secret-0123456789abcdef";
const bootstrapEmail = "first-admin-e2e@example.test";
const bootstrapName = "Minarva E2E Administrator";
const adminOrigin = "http://127.0.0.1:3001";
const appOrigin = "http://127.0.0.1:3000";
const chosenPassword = "Minarva-E2E-Owner!2026";
const edgeHash = createHash("sha256").update(edgeSecret, "utf8").digest("hex");

function sqlLiteral(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function psqlScalar(sql) {
  return run("psql", [
    dbUrl,
    "-X",
    "-q",
    "-t",
    "-A",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    sql,
  ]);
}

psqlScalar(
  "insert into license_private.edge_credentials (id, secret_sha256, active) values (" +
    sqlLiteral("first-admin-e2e") +
    ", " +
    sqlLiteral(edgeHash) +
    ", true) on conflict (id) do update set secret_sha256 = excluded.secret_sha256, active = true;",
);

const env = {
  SUPABASE_URL: apiUrl,
  SUPABASE_PUBLISHABLE_KEY: publishableKey,
  LICENSE_EDGE_RPC_SECRET: edgeSecret,
  LICENSE_ADMIN_BOOTSTRAP_EMAIL: bootstrapEmail,
  LICENSE_ADMIN_BOOTSTRAP_NAME: bootstrapName,
  LICENSE_ADMIN_ALLOWED_ORIGINS: adminOrigin,
  MINARVA_ONLINE_APP_URL: appOrigin,
};

async function workerJson(path, options = {}) {
  const headers = new Headers({
    accept: "application/json",
    origin: adminOrigin,
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
    env,
  );
  return {
    status: response.status,
    headers: response.headers,
    data: await response.json().catch(() => null),
  };
}

async function authJson(path, options = {}) {
  const headers = new Headers({
    accept: "application/json",
    apikey: publishableKey,
    "content-type": "application/json",
  });
  if (options.token) headers.set("authorization", "Bearer " + options.token);
  const response = await fetch(apiUrl + "/auth/v1" + path, {
    method: options.method || "POST",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: "manual",
  });
  return {
    status: response.status,
    headers: response.headers,
    data: await response.json().catch(() => null),
  };
}


async function rpcJson(name, body) {
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
  return {
    status: response.status,
    headers: response.headers,
    data: await response.json().catch(() => null),
  };
}

function recipientMatches(message, email) {
  return JSON.stringify(message?.To || message?.to || "").toLowerCase().includes(email.toLowerCase());
}

async function mailboxIds() {
  const response = await fetch(mailpitUrl + "/api/v1/messages");
  assert.equal(response.status, 200, "Mailpit message list must be reachable.");
  const data = await response.json();
  return new Set((data.messages || []).map((entry) => String(entry.ID || entry.id || "")));
}

function verificationLink(message, expectedType) {
  const raw = String(message?.Text || "") + "\n" + String(message?.HTML || "");
  const normalized = raw.replaceAll("&amp;", "&");
  const candidates = normalized.match(/https?:\/\/[^\s"'<>]+/g) || [];
  for (const candidate of candidates) {
    const cleaned = candidate.replace(/[),.;]+$/, "");
    try {
      const url = new URL(cleaned);
      if (
        url.pathname.endsWith("/auth/v1/verify") &&
        url.searchParams.get("type") === expectedType
      ) {
        return url.toString();
      }
    } catch {
      // Ignore non-URL text fragments from the email body.
    }
  }
  return "";
}

async function waitForVerificationMail(beforeIds, expectedType, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(mailpitUrl + "/api/v1/messages");
    if (response.ok) {
      const data = await response.json();
      for (const summary of data.messages || []) {
        const id = String(summary.ID || summary.id || "");
        if (!id || beforeIds.has(id) || !recipientMatches(summary, bootstrapEmail)) continue;
        const messageResponse = await fetch(mailpitUrl + "/api/v1/message/" + encodeURIComponent(id));
        if (!messageResponse.ok) continue;
        const message = await messageResponse.json();
        const link = verificationLink(message, expectedType);
        if (link) return link;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error("Timed out waiting for Supabase " + expectedType + " email in Mailpit.");
}

async function followVerificationLink(link) {
  const response = await fetch(link, { redirect: "manual" });
  assert.ok(
    [301, 302, 303, 307, 308].includes(response.status),
    "Supabase verification link must redirect after successful verification.",
  );
  const location = response.headers.get("location") || "";
  assert.ok(location, "Supabase verification redirect location is missing.");
  return location;
}

function jwtClaims(token) {
  const parts = String(token).split(".");
  assert.equal(parts.length, 3, "Expected a JWT access token.");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
}

function base32Bytes(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of String(input).toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "")) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Unsupported base32 TOTP secret.");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function totpCode(secret, timeMs = Date.now()) {
  const counter = BigInt(Math.floor(timeMs / 1000 / 30));
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(counter);
  const digest = createHmac("sha1", base32Bytes(secret)).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function databaseSnapshot() {
  const email = sqlLiteral(bootstrapEmail);
  const sql =
    "select json_build_object(" +
    "'user_count',(select count(*) from auth.users where lower(email)=" + email + ")," +
    "'confirmed',coalesce((select email_confirmed_at is not null from auth.users where lower(email)=" + email + " limit 1),false)," +
    "'profile_count',(select count(*) from public.profiles p join auth.users u on u.id=p.id where lower(u.email)=" + email + ")," +
    "'member_count',(select count(*) from public.organization_members om join auth.users u on u.id=om.user_id where lower(u.email)=" + email + ")," +
    "'admin_count',(select count(*) from public.license_admin_identities where lower(email)=" + email + ")," +
    "'audit_count',(select count(*) from public.license_admin_audit_log where lower(actor_email)=" + email + " and action='admin.bootstrap.claim' and outcome='success')," +
    "'reservation_count',(select count(*) from license_private.admin_bootstrap_signup_reservations where email=" + email + ")," +
    "'marker',coalesce((select raw_app_meta_data->>'minarva_license_admin_bootstrap' from auth.users where lower(email)=" + email + " limit 1),'')," +
    "'account_type',coalesce((select raw_user_meta_data->>'account_type' from auth.users where lower(email)=" + email + " limit 1),'')," +
    "'bootstrap_token',coalesce((select raw_user_meta_data->>'bootstrap_token' from auth.users where lower(email)=" + email + " limit 1),'')," +
    "'identity_account_type',coalesce((select identity_data->>'account_type' from auth.identities where user_id=(select id from auth.users where lower(email)=" + email + " limit 1) limit 1),'')," +
    "'identity_bootstrap_token',coalesce((select identity_data->>'bootstrap_token' from auth.identities where user_id=(select id from auth.users where lower(email)=" + email + " limit 1) limit 1),'')" +
    ")::text;";
  return JSON.parse(psqlScalar(sql));
}


function customerSnapshot(emailInput) {
  const email = sqlLiteral(String(emailInput).toLowerCase());
  const sql =
    "select json_build_object(" +
    "'user_count',(select count(*) from auth.users where lower(email)=" + email + ")," +
    "'profile_count',(select count(*) from public.profiles p join auth.users u on u.id=p.id where lower(u.email)=" + email + ")," +
    "'member_count',(select count(*) from public.organization_members om join auth.users u on u.id=om.user_id where lower(u.email)=" + email + ")," +
    "'org_count',(select count(distinct om.org_id) from public.organization_members om join auth.users u on u.id=om.user_id where lower(u.email)=" + email + ")," +
    "'hq_count',(select count(*) from public.branches b join public.organization_members om on om.org_id=b.org_id join auth.users u on u.id=om.user_id where lower(u.email)=" + email + " and b.code='HQ' and b.is_headquarters=true)," +
    "'admin_count',(select count(*) from public.license_admin_identities lai where lower(lai.email)=" + email + ")," +
    "'bootstrap_marker',coalesce((select raw_app_meta_data->>'minarva_license_admin_bootstrap' from auth.users where lower(email)=" + email + " limit 1),'')" +
    ")::text;";
  return JSON.parse(psqlScalar(sql));
}

// 1. Fresh control plane is open but does not reveal configured identity details.
assert.equal(
  psqlScalar("select count(*) from public.license_admin_identities;"),
  "0",
  "Fresh-instance E2E must begin with an empty License Admin registry.",
);
assert.equal(
  psqlScalar("select count(*) from auth.users;"),
  "0",
  "Fresh-instance E2E must begin with no Auth identities.",
);
const initialStatus = await workerJson("/api/admin/bootstrap/status");
assert.equal(initialStatus.status, 200);
assert.deepEqual(initialStatus.data, { ok: true, required: true, configured: true });
assert.equal(initialStatus.headers.get("access-control-allow-origin"), adminOrigin);

// 2. Malformed/wrong-email probes fail without creating an Auth identity.
const malformed = await workerJson("/api/admin/bootstrap/signup-reservation", {
  method: "POST",
  body: { email: "not-an-email" },
  ip: "203.0.113.6",
});
assert.equal(malformed.status, 400);
assert.equal(malformed.data?.code, "INVALID_REQUEST");

const wrongEmail = await workerJson("/api/admin/bootstrap/signup-reservation", {
  method: "POST",
  body: { email: "wrong-admin@example.test" },
  ip: "203.0.113.7",
});
assert.equal(wrongEmail.status, 403);
assert.equal(wrongEmail.data?.code, "BOOTSTRAP_SIGNUP_NOT_ALLOWED");
assert.equal(
  psqlScalar("select count(*) from auth.users where lower(email)='wrong-admin@example.test';"),
  "0",
);

// 3. The reservation is a one-time capability: it cannot be silently rotated,
// and a normal signup cannot steal the reserved bootstrap email during the race window.
const reservationTokenA = "e2e-bootstrap-reservation-capability-a-0123456789abcdef";
const reservationTokenB = "e2e-bootstrap-reservation-capability-b-fedcba9876543210";
const reserveDirect = await rpcJson("cloudflare_admin_prepare_bootstrap_signup", {
  p_edge_secret: edgeSecret,
  p_bootstrap_email: bootstrapEmail,
  p_requested_email: bootstrapEmail,
  p_token_sha256: createHash("sha256").update(reservationTokenA, "utf8").digest("hex"),
  p_client_ip: "198.51.100.90",
});
assert.equal(reserveDirect.status, 200);
assert.equal(reserveDirect.data?.ok, true);

const rotateDirect = await rpcJson("cloudflare_admin_prepare_bootstrap_signup", {
  p_edge_secret: edgeSecret,
  p_bootstrap_email: bootstrapEmail,
  p_requested_email: bootstrapEmail,
  p_token_sha256: createHash("sha256").update(reservationTokenB, "utf8").digest("hex"),
  p_client_ip: "198.51.100.90",
});
assert.equal(rotateDirect.status, 200);
assert.equal(rotateDirect.data?.ok, false);
assert.equal(rotateDirect.data?.code, "BOOTSTRAP_RESERVATION_ACTIVE");
assert.equal(Number(rotateDirect.data?.httpStatus), 409);

const theftAttempt = await authJson("/signup", {
  body: {
    email: bootstrapEmail,
    password: "Attacker-Controlled-E2E!2026",
    data: { full_name: "Reservation Theft Probe" },
  },
});
assert.ok(
  theftAttempt.status >= 400,
  "Normal signup must fail while the bootstrap email has an active reservation.",
);
assert.equal(
  psqlScalar("select count(*) from auth.users where lower(email)=" + sqlLiteral(bootstrapEmail) + ";"),
  "0",
  "Reserved bootstrap email must not be consumed by normal signup.",
);
psqlScalar(
  "delete from license_private.admin_bootstrap_signup_reservations where email=" +
    sqlLiteral(bootstrapEmail) +
    ";",
);

// 4. Cloudflare reserves and creates the Auth user; the browser never supplies the password.
const beforeConfirmation = await mailboxIds();
const prepared = await workerJson("/api/admin/bootstrap/signup-reservation", {
  method: "POST",
  body: { email: bootstrapEmail },
  ip: "203.0.113.7",
});
assert.equal(prepared.status, 200);
assert.equal(prepared.data?.ok, true);
assert.equal(prepared.data?.confirmationSent, true);
assert.equal(prepared.data?.signupToken, undefined);

let db = databaseSnapshot();
assert.equal(Number(db.user_count), 1);
assert.equal(db.confirmed, false);
assert.equal(Number(db.profile_count), 0, "License Admin bootstrap must not create a tenant profile.");
assert.equal(Number(db.member_count), 0, "License Admin bootstrap must not create tenant membership.");
assert.equal(Number(db.reservation_count), 0, "One-time signup reservation must be consumed.");
assert.equal(db.marker, "true", "Server-controlled bootstrap marker must be stamped.");
assert.equal(db.account_type, "", "Transient account_type must be stripped from durable user metadata.");
assert.equal(db.bootstrap_token, "", "Transient bootstrap token must be stripped from durable user metadata.");
assert.equal(db.identity_account_type, "", "Transient account_type must not persist in identity metadata.");
assert.equal(db.identity_bootstrap_token, "", "Transient bootstrap token must not persist in identity metadata.");

// 5. Mailbox ownership confirms the account.
const confirmationLink = await waitForVerificationMail(beforeConfirmation, "signup");
await followVerificationLink(confirmationLink);
db = databaseSnapshot();
assert.equal(db.confirmed, true);

// 6. Mailbox ownership chooses the real password through recovery, not signup.
const preRecoveryLogin = await authJson("/token?grant_type=password", {
  body: { email: bootstrapEmail, password: chosenPassword },
});
assert.ok(
  preRecoveryLogin.status >= 400,
  "The eventual owner-selected password must not work before mailbox-owned recovery sets it.",
);

const beforeRecovery = await mailboxIds();
const recovery = await authJson(
  "/recover?redirect_to=" + encodeURIComponent(appOrigin + "/reset-password"),
  { body: { email: bootstrapEmail } },
);
assert.equal(recovery.status, 200);
const recoveryLink = await waitForVerificationMail(beforeRecovery, "recovery");
const recoveryLocation = await followVerificationLink(recoveryLink);
const recoveryUrl = new URL(recoveryLocation);
const recoveryFragment = new URLSearchParams(recoveryUrl.hash.replace(/^#/, ""));
const recoveryAccessToken = recoveryFragment.get("access_token") || "";
assert.ok(recoveryAccessToken.length > 40, "Recovery verification must yield a mailbox-owned access token.");

const passwordUpdate = await authJson("/user", {
  method: "PUT",
  token: recoveryAccessToken,
  body: { password: chosenPassword },
});
assert.equal(passwordUpdate.status, 200);

// 7. Password sign-in yields AAL1 and AAL1 is explicitly insufficient to claim first admin.
const login = await authJson("/token?grant_type=password", {
  body: { email: bootstrapEmail, password: chosenPassword },
});
assert.equal(login.status, 200);
const aal1Token = String(login.data?.access_token || "");
const userId = String(login.data?.user?.id || "");
assert.match(userId, /^[0-9a-f-]{36}$/i);
const aal1Claims = jwtClaims(aal1Token);
assert.equal(aal1Claims.aal, "aal1");

const prematureClaim = await workerJson("/api/admin/bootstrap/claim", {
  method: "POST",
  token: aal1Token,
  body: {},
});
assert.equal(prematureClaim.status, 403);
assert.equal(prematureClaim.data?.code, "MFA_REQUIRED");

// 8. Enroll and verify real Supabase TOTP, yielding AAL2.
const enrollment = await authJson("/factors", {
  token: aal1Token,
  body: {
    factor_type: "totp",
    friendly_name: "Minarva Fresh Instance E2E",
  },
});
assert.equal(enrollment.status, 200);
const factorId = String(enrollment.data?.id || "");
const totpSecret = String(enrollment.data?.totp?.secret || "");
assert.match(factorId, /^[0-9a-f-]{36}$/i);
assert.ok(totpSecret.length >= 16);

const challenge = await authJson("/factors/" + encodeURIComponent(factorId) + "/challenge", {
  token: aal1Token,
  body: {},
});
assert.equal(challenge.status, 200);
const challengeId = String(challenge.data?.id || "");
assert.match(challengeId, /^[0-9a-f-]{36}$/i);

const verified = await authJson("/factors/" + encodeURIComponent(factorId) + "/verify", {
  token: aal1Token,
  body: {
    challenge_id: challengeId,
    code: totpCode(totpSecret),
  },
});
assert.equal(verified.status, 200);
const aal2Token = String(verified.data?.access_token || "");
const aal2Claims = jwtClaims(aal2Token);
assert.equal(aal2Claims.aal, "aal2");
assert.ok(
  Array.isArray(aal2Claims.amr) &&
    aal2Claims.amr.some((entry) =>
      typeof entry === "string" ? entry === "totp" : entry?.method === "totp",
    ),
  "AAL2 token must record TOTP authentication.",
);

// 9. AAL2 + confirmed configured email can claim exactly one first administrator.
const claim = await workerJson("/api/admin/bootstrap/claim", {
  method: "POST",
  token: aal2Token,
  body: {},
});
assert.equal(claim.status, 200);
assert.equal(claim.data?.ok, true);
assert.equal(claim.data?.identity?.id, userId);
assert.equal(claim.data?.identity?.email, bootstrapEmail);
assert.equal(claim.data?.identity?.displayName, bootstrapName);
assert.equal(claim.data?.identity?.role, "admin");

const me = await workerJson("/api/admin/me", { token: aal2Token });
assert.equal(me.status, 200);
assert.equal(me.data?.ok, true);
assert.equal(me.data?.identity?.id, userId);
assert.equal(me.data?.identity?.role, "admin");

const closedStatus = await workerJson("/api/admin/bootstrap/status");
assert.equal(closedStatus.status, 200);
assert.equal(closedStatus.data?.required, false);

const secondClaim = await workerJson("/api/admin/bootstrap/claim", {
  method: "POST",
  token: aal2Token,
  body: {},
});
assert.equal(secondClaim.status, 409);
assert.equal(secondClaim.data?.code, "BOOTSTRAP_CLOSED");

db = databaseSnapshot();
assert.equal(Number(db.profile_count), 0);
assert.equal(Number(db.member_count), 0);
assert.equal(Number(db.admin_count), 1);
assert.equal(Number(db.audit_count), 1);
assert.equal(Number(db.reservation_count), 0);

// 10. Closing the control-plane bootstrap must not damage normal customer bootstrap.
const customerEmail = "normal-customer-e2e@example.test";
const customerSignup = await authJson("/signup", {
  body: {
    email: customerEmail,
    password: "Minarva-E2E-Customer!2026",
    data: {
      full_name: "E2E Customer",
      shop_name: "E2E Customer Shop",
    },
  },
});
assert.equal(customerSignup.status, 200);
const customer = customerSnapshot(customerEmail);
assert.equal(Number(customer.user_count), 1);
assert.equal(Number(customer.profile_count), 1, "Normal customer signup must create its profile.");
assert.equal(Number(customer.member_count), 1, "Normal customer signup must create organization membership.");
assert.equal(Number(customer.org_count), 1, "Normal customer signup must create exactly one organization.");
assert.equal(Number(customer.hq_count), 1, "Normal customer signup must create exactly one HQ branch.");
assert.equal(Number(customer.admin_count), 0, "Normal customer must never become a License Admin.");
assert.equal(customer.bootstrap_marker, "", "Normal customer must not receive the License Admin bootstrap marker.");
assert.equal(
  psqlScalar("select count(*) from public.license_admin_identities;"),
  "1",
  "Customer bootstrap must not alter the one-admin control-plane registry.",
);

// 11. Normal UI bootstrap is browser-native; retained privileged server helpers are not imported.
const bootstrapHookSource = fs.readFileSync(
  "apps/license-admin/src/app/admin-panel/useFirstAdminBootstrap.ts",
  "utf8",
);
assert.match(bootstrapHookSource, /from ["']\.\/browser-admin-auth["']/);
assert.doesNotMatch(bootstrapHookSource, /bootstrapFirstLicenseAdmin|firstAdminBootstrapStatus/);
assert.doesNotMatch(bootstrapHookSource, /from ["'][^"']*actions["']/);
const serverActionsSource = fs.readFileSync(
  "apps/license-admin/src/app/actions.ts",
  "utf8",
);
assert.doesNotMatch(serverActionsSource, /export async function firstAdminBootstrapStatus\b/);
assert.doesNotMatch(serverActionsSource, /export async function bootstrapFirstLicenseAdmin\b/);
assert.match(serverActionsSource, /export async function loginEmergencyAdmin\b/);
assert.match(serverActionsSource, /export async function logoutEmergencyAdmin\b/);

console.log(
  "Fresh-instance first-admin E2E PASS: fresh registry -> guarded reservation/anti-theft -> Cloudflare random credential -> confirmation -> mailbox-owned password -> TOTP AAL2 -> one-time claim -> admin/me -> normal customer tenant bootstrap.",
);
