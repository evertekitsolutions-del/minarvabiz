import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const MIN_SECRET_LENGTH = 32;
const MAX_SECRET_LENGTH = 2048;
const MAX_PREVIOUS_GRACE_MS = 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function envValue(env, name) {
  return String(env?.[name] || "").trim();
}

function sha256Hex(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function allowedSupabaseOrigin(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol === "https:") return url.origin;
    if (
      url.protocol === "http:" &&
      (
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "::1" ||
        url.hostname === "[::1]"
      )
    ) {
      return url.origin;
    }
    return "";
  } catch {
    return "";
  }
}

export function buildLegacyEmergencySyncPayload(env = process.env, nowMs = Date.now()) {
  const current = envValue(env, "LICENSE_API_SECRET");
  const email = envValue(env, "LICENSE_ADMIN_EMERGENCY_ACTOR_EMAIL").toLowerCase();
  const displayName = envValue(env, "LICENSE_ADMIN_EMERGENCY_ACTOR_NAME");
  const enabled = envValue(env, "LICENSE_ADMIN_EMERGENCY_LOGIN_ENABLED").toLowerCase() === "true";

  if (current.length < MIN_SECRET_LENGTH || current.length > MAX_SECRET_LENGTH) {
    return { ready: false, reason: "current-not-configured" };
  }
  if (!EMAIL_RE.test(email) || email.length > 254 || !displayName || displayName.length > 120) {
    return { ready: false, reason: "actor-not-configured" };
  }

  const currentSha256 = sha256Hex(current);
  const previous = envValue(env, "LICENSE_API_SECRET_PREVIOUS");
  const rawPreviousValidUntil = envValue(env, "LICENSE_API_SECRET_PREVIOUS_VALID_UNTIL");
  const previousValidUntilMs = rawPreviousValidUntil
    ? new Date(rawPreviousValidUntil).getTime()
    : Number.NaN;
  const previousConfigured =
    previous.length >= MIN_SECRET_LENGTH &&
    previous.length <= MAX_SECRET_LENGTH;
  const previousActive =
    previousConfigured &&
    Number.isFinite(previousValidUntilMs) &&
    previousValidUntilMs > nowMs &&
    previousValidUntilMs <= nowMs + MAX_PREVIOUS_GRACE_MS;

  let previousSha256 = null;
  let previousValidUntil = null;
  if (previousActive) {
    const candidate = sha256Hex(previous);
    if (candidate !== currentSha256) {
      previousSha256 = candidate;
      previousValidUntil = new Date(previousValidUntilMs).toISOString();
    }
  }

  return {
    ready: true,
    payload: {
      p_current_sha256: currentSha256,
      p_previous_sha256: previousSha256,
      p_previous_valid_until: previousValidUntil,
      p_enabled: enabled,
      p_actor_email: email,
      p_display_name: displayName,
    },
  };
}

export async function syncLegacyEmergencyAuthority({
  env = process.env,
  fetchImpl = globalThis.fetch,
  nowMs = Date.now(),
} = {}) {
  const built = buildLegacyEmergencySyncPayload(env, nowMs);
  if (!built.ready) {
    return { ok: true, status: "skipped", reason: built.reason };
  }

  const supabaseOrigin = allowedSupabaseOrigin(
    envValue(env, "SUPABASE_URL") || envValue(env, "NEXT_PUBLIC_SUPABASE_URL"),
  );
  const serviceKey =
    envValue(env, "SUPABASE_SECRET_KEY") ||
    envValue(env, "SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseOrigin || serviceKey.length < 20 || typeof fetchImpl !== "function") {
    return { ok: true, status: "skipped", reason: "database-not-configured" };
  }

  try {
    const response = await fetchImpl(
      supabaseOrigin + "/rest/v1/rpc/sync_license_admin_emergency_authority",
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          authorization: "Bearer " + serviceKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(built.payload),
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
      },
    );
    const data = await response.json().catch(() => null);

    if (!response.ok || !data || typeof data !== "object" || Array.isArray(data) || data.ok !== true) {
      return {
        ok: false,
        status: "failed",
        reason: "authority-rpc-rejected",
      };
    }

    return {
      ok: true,
      status: "synced",
      changed: data.changed === true,
      enabled: data.enabled === true,
      previousActive: data.previousActive === true,
    };
  } catch {
    return { ok: false, status: "failed", reason: "authority-rpc-unavailable" };
  }
}

async function main() {
  const result = await syncLegacyEmergencyAuthority();
  if (result.status === "synced") {
    console.log(
      "License Admin emergency authority digest sync: synced" +
        (result.changed ? " (changed)." : " (unchanged)."),
    );
    return;
  }
  if (result.status === "skipped") {
    console.log("License Admin emergency authority digest sync: skipped safely.");
    return;
  }
  console.warn(
    "License Admin emergency authority digest sync: failed safely; legacy emergency path remains authoritative.",
  );
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (entry && import.meta.url === entry) {
  await main().catch(() => {
    console.warn(
      "License Admin emergency authority digest sync: failed safely; legacy emergency path remains authoritative.",
    );
  });
}
