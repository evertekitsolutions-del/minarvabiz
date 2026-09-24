import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { minarvaHttpSecurityHeaders } from "../packages/utils/src/security-headers.ts";

const middlewareSource = await readFile(
  new URL("../apps/web/src/middleware.ts", import.meta.url),
  "utf8",
);
const nextConfigSource = await readFile(
  new URL("../apps/web/next.config.ts", import.meta.url),
  "utf8",
);
const rootLayoutSource = await readFile(
  new URL("../apps/web/src/app/layout.tsx", import.meta.url),
  "utf8",
);

assert.ok(
  !nextConfigSource.includes("Content-Security-Policy"),
  "Static web CSP must stay out of next.config.ts",
);
assert.ok(nextConfigSource.includes("@minarvabiz/utils/security-headers"));
assert.ok(nextConfigSource.includes("minarvaHttpSecurityHeaders()"));
assert.ok(middlewareSource.includes("@minarvabiz/utils/security-headers"));
assert.ok(middlewareSource.includes("buildMinarvaNonceCsp("));
assert.ok(!middlewareSource.includes("function buildContentSecurityPolicy"));
assert.ok(middlewareSource.includes('requestHeaders.set("x-nonce", nonce)'));
assert.ok(rootLayoutSource.includes('from "next/headers"'));
assert.ok(
  rootLayoutSource.includes("await headers()"),
  "Root layout must stay request-bound for nonce propagation",
);
assert.ok(
  middlewareSource.includes(
    'requestHeaders.set("Content-Security-Policy", contentSecurityPolicy)',
  ),
);
assert.ok(
  middlewareSource.includes(
    'response.headers.set("Content-Security-Policy", contentSecurityPolicy)',
  ),
);
assert.ok(
  middlewareSource.includes("NEXT_PUBLIC_SUPABASE_URL"),
  "Supabase origin must remain in connect-src construction",
);
assert.ok(
  middlewareSource.includes("wss://"),
  "Supabase realtime WSS origin must remain supported",
);

function directive(csp, name) {
  return (
    csp
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(name + " ")) || ""
  );
}

function nonceFromCsp(csp) {
  const scriptSrc = directive(csp, "script-src");
  assert.ok(scriptSrc, "script-src directive is missing");
  assert.ok(scriptSrc.includes("'strict-dynamic'"), "strict-dynamic is missing");
  assert.ok(
    !scriptSrc.includes("'unsafe-inline'"),
    "production script-src contains unsafe-inline",
  );
  assert.ok(
    !scriptSrc.includes("'unsafe-eval'"),
    "production script-src contains unsafe-eval",
  );

  const marker = "'nonce-";
  const start = scriptSrc.indexOf(marker);
  assert.ok(start >= 0, "script nonce is missing");
  const end = scriptSrc.indexOf("'", start + marker.length);
  assert.ok(end > start + marker.length, "script nonce is malformed");
  return scriptSrc.slice(start + marker.length, end);
}

function assertSecurityHeaders(response) {
  for (const header of minarvaHttpSecurityHeaders()) {
    assert.equal(
      response.headers.get(header.key),
      header.value,
      "main web security header mismatch: " + header.key,
    );
  }
}

async function fetchDocument(url) {
  const response = await fetch(url, {
    headers: { accept: "text/html" },
    cache: "no-store",
  });
  assert.equal(response.status, 200, "main web did not return HTTP 200");
  assertSecurityHeaders(response);

  const csp = response.headers.get("content-security-policy") || "";
  assert.ok(csp, "Content-Security-Policy response header is missing");
  const nonce = nonceFromCsp(csp);

  const html = await response.text();
  const scripts = html.match(/<script\b[^>]*>/gi) || [];
  assert.ok(scripts.length > 0, "No Next.js script tags were found in rendered HTML");

  const doubleQuoted = 'nonce="' + nonce + '"';
  const singleQuoted = "nonce='" + nonce + "'";
  for (const script of scripts) {
    assert.ok(
      script.includes(doubleQuoted) || script.includes(singleQuoted),
      "Rendered script tag is missing the request nonce: " + script.slice(0, 180),
    );
  }

  return { nonce, csp };
}

const baseUrl = String(process.env.WEB_CSP_URL || "").trim();
if (baseUrl) {
  const first = await fetchDocument(baseUrl);
  const second = await fetchDocument(baseUrl);

  assert.notEqual(first.nonce, second.nonce, "CSP nonce must be unique per request");

  const expectedOrigin = String(process.env.EXPECTED_CONNECT_ORIGIN || "").trim();
  if (expectedOrigin) {
    assert.ok(
      directive(first.csp, "connect-src").includes(expectedOrigin),
      "Expected Supabase connect-src origin is missing",
    );
  }
}

console.log(
  baseUrl
    ? "Main web nonce CSP + shared security headers runtime smoke PASS"
    : "Main web nonce CSP shared-baseline static smoke PASS",
);
