import assert from "node:assert/strict";
import worker from "../infra/cloudflare-license-edge/src/index.js";

const publishableKey = "sb_publishable_self_host_origin_test_key";

async function authConfig(env) {
  const response = await worker.fetch(
    new Request("https://worker.test/api/admin/auth-config", {
      method: "GET",
      headers: { origin: env.LICENSE_ADMIN_ALLOWED_ORIGINS },
    }),
    env,
  );
  return {
    status: response.status,
    body: await response.json(),
    allowOrigin: response.headers.get("access-control-allow-origin"),
  };
}

const local = await authConfig({
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_PUBLISHABLE_KEY: publishableKey,
  MINARVA_ONLINE_APP_URL: "http://127.0.0.1:3000",
  LICENSE_ADMIN_ALLOWED_ORIGINS: "http://127.0.0.1:3001",
});
assert.equal(local.status, 200, "loopback HTTP must be supported for local/self-host verification");
assert.equal(local.body.supabaseUrl, "http://127.0.0.1:54321");
assert.equal(local.body.passwordResetUrl, "http://127.0.0.1:3000/reset-password");
assert.equal(local.allowOrigin, "http://127.0.0.1:3001");

const selfHosted = await authConfig({
  SUPABASE_URL: "https://supabase.example.test",
  SUPABASE_PUBLISHABLE_KEY: publishableKey,
  MINARVA_ONLINE_APP_URL: "https://app.example.test",
  LICENSE_ADMIN_ALLOWED_ORIGINS: "https://admin.example.test",
});
assert.equal(selfHosted.status, 200, "deployment-configured HTTPS self-host origins must be provider-neutral");
assert.equal(selfHosted.body.supabaseUrl, "https://supabase.example.test");
assert.equal(selfHosted.body.passwordResetUrl, "https://app.example.test/reset-password");

const insecureRemote = await authConfig({
  SUPABASE_URL: "http://supabase.example.test",
  SUPABASE_PUBLISHABLE_KEY: publishableKey,
  MINARVA_ONLINE_APP_URL: "https://app.example.test",
  LICENSE_ADMIN_ALLOWED_ORIGINS: "https://admin.example.test",
});
assert.equal(insecureRemote.status, 503, "non-loopback HTTP Supabase origins must fail closed");

const insecureApp = await authConfig({
  SUPABASE_URL: "https://supabase.example.test",
  SUPABASE_PUBLISHABLE_KEY: publishableKey,
  MINARVA_ONLINE_APP_URL: "http://app.example.test",
  LICENSE_ADMIN_ALLOWED_ORIGINS: "https://admin.example.test",
});
assert.equal(insecureApp.status, 503, "non-loopback HTTP app origins must fail closed");

console.log("Cloudflare self-host origin portability smoke passed.");
