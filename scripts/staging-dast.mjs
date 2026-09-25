import assert from "node:assert/strict";
const baseRaw = String(process.env.STAGING_BASE_URL || "").trim();
if (!baseRaw) throw new Error("STAGING_BASE_URL is required");
const base = new URL(baseRaw.endsWith("/") ? baseRaw : baseRaw + "/");

function url(pathname) {
  return new URL(pathname.replace(/^\//, ""), base).toString();
}

async function request(pathname, init = {}) {
  const response = await fetch(url(pathname), {
    redirect: "manual",
    ...init,
    headers: {
      "user-agent": "Minarva-Biz-Staging-DAST/1.0",
      ...(init.headers || {}),
    },
  });
  if (response.status >= 500) {
    const body = await response.text();
    throw new Error(`${init.method || "GET"} ${pathname} returned ${response.status}: ${body.slice(0, 300)}`);
  }
  return response;
}

const results = [];

for (const method of ["PUT", "PATCH", "DELETE"]) {
  const response = await request("/login", { method });
  assert.ok(response.status >= 400, `${method} /login must not succeed (got ${response.status})`);
  results.push({ test: "dangerous-method", method, status: response.status });
}

const traversalPayloads = [
  "/%2e%2e/%2e%2e/etc/passwd",
  "/.git/config",
  "/.env",
  "/package.json",
];
for (const pathname of traversalPayloads) {
  const response = await request(pathname);
  const body = await response.text();
  assert.ok(response.status >= 400 || response.status === 308, `${pathname} should not expose a file (got ${response.status})`);
  assert.doesNotMatch(body, /root:x:0:0:|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY\s*=/i);
  results.push({ test: "sensitive-path", pathname, status: response.status });
}

const xssPayload = "<script>window.__MINARVA_XSS__=1</script>";
const xss = await request("/login?next=" + encodeURIComponent(xssPayload));
const xssBody = await xss.text();
assert.doesNotMatch(xssBody, /<script>window\.__MINARVA_XSS__=1<\/script>/i, "raw reflected XSS payload reached HTML");
results.push({ test: "reflected-xss", status: xss.status });

const redirect = await request("/login?next=" + encodeURIComponent("https://evil.example/minarva"));
const location = String(redirect.headers.get("location") || "");
assert.ok(!location.startsWith("https://evil.example"), "open redirect to untrusted origin detected");
results.push({ test: "open-redirect", status: redirect.status, location: location || null });

const cors = await request("/dashboard", {
  method: "OPTIONS",
  headers: {
    origin: "https://evil.example",
    "access-control-request-method": "GET",
  },
});
const allowOrigin = String(cors.headers.get("access-control-allow-origin") || "");
assert.notEqual(allowOrigin, "*", "cross-origin wildcard CORS is not allowed");
assert.notEqual(allowOrigin, "https://evil.example", "untrusted origin must not be reflected in CORS");
results.push({ test: "cors", status: cors.status, allowOrigin: allowOrigin || null });

for (const pathname of ["/login?__proto__[polluted]=1", "/reset-password?access_token=%3Csvg%2Fonload%3Dalert(1)%3E", "/forgot-password?email=%00"]) {
  const response = await request(pathname);
  assert.ok(response.status < 500);
  results.push({ test: "malformed-input", pathname, status: response.status });
}

console.log("STAGING_DAST PASS", JSON.stringify({ base: base.origin, checks: results.length, results }));
