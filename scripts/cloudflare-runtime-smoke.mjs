import assert from "node:assert/strict";

// Run against the compiled Worker, locally or after a preview deployment.
const origin = new URL(process.env.MINARVA_CLOUDFLARE_PREVIEW_URL || "http://127.0.0.1:8787");
assert.ok(origin.protocol === "https:" ||
  (origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)),
"Runtime smoke requires HTTPS or loopback HTTP");
const request = (path, init = {}) => fetch(new URL(path, origin), {
  redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(20_000), ...init,
});

let previousNonce;
for (const path of ["/", "/login", "/login", "/forgot-password", "/reset-password"]) {
  const response = await request(path);
  assert.equal(response.status, 200, `${path}: page must render in Workers`);
  const csp = response.headers.get("content-security-policy") || "";
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  assert.ok(nonce, `${path}: middleware nonce missing`);
  assert.notEqual(nonce, previousNonce, "Nonce must rotate on every request");
  previousNonce = nonce;
  const html = await response.text();
  assert.ok(html.includes(`nonce="${nonce}"`), `${path}: document scripts must use middleware nonce`);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-powered-by"), null);
  assert.doesNotMatch(html, /sb_secret_|BEGIN (?:RSA |EC )?PRIVATE KEY/);
  if (path === "/") assert.ok(html.includes('id="features"') && html.includes('id="download"'));
}
for (const [path, method] of [["/login", "POST"], ["/api/support/chat", "DELETE"]]) {
  const response = await request(path, { method });
  assert.equal(response.status, 405, `${method} ${path}: middleware must refuse method`);
  await response.arrayBuffer();
}
const notFound = await request("/cloudflare-runtime-smoke-nonexistent-route");
assert.equal(notFound.status, 404);
await notFound.arrayBuffer();
console.log("Cloudflare compiled Worker runtime smoke PASS:", origin.origin);
