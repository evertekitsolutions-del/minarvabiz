import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { minarvaHttpSecurityHeaders } from "../packages/utils/src/security-headers.ts";

const middlewareSource = await readFile(
  new URL("../apps/license-admin/src/middleware.ts", import.meta.url),
  "utf8",
);
const nextConfigSource = await readFile(
  new URL("../apps/license-admin/next.config.ts", import.meta.url),
  "utf8",
);

assert.ok(
  !nextConfigSource.includes("Content-Security-Policy"),
  "Static CSP must stay out of next.config.ts",
);
assert.ok(nextConfigSource.includes("@minarvabiz/utils/security-headers"));
assert.ok(nextConfigSource.includes("minarvaHttpSecurityHeaders()"));
assert.ok(middlewareSource.includes("@minarvabiz/utils/security-headers"));
assert.ok(middlewareSource.includes("buildMinarvaNonceCsp("));
assert.ok(!middlewareSource.includes("function buildContentSecurityPolicy"));
assert.ok(middlewareSource.includes('requestHeaders.set("x-nonce", nonce)'));
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

function getDirective(csp, name) {
  return (
    csp
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(name + " ")) || ""
  );
}

function getNonce(csp) {
  const scriptSrc = getDirective(csp, "script-src");
  assert.ok(scriptSrc, "script-src directive is missing");
  assert.ok(scriptSrc.includes("'strict-dynamic'"), "strict-dynamic is missing");
  assert.ok(!scriptSrc.includes("'unsafe-inline'"), "production script-src contains unsafe-inline");
  assert.ok(!scriptSrc.includes("'unsafe-eval'"), "production script-src contains unsafe-eval");
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
      "license-admin security header mismatch: " + header.key,
    );
  }
}

async function fetchDocument(baseUrl) {
  const response = await fetch(baseUrl, {
    headers: { accept: "text/html" },
    redirect: "manual",
    cache: "no-store",
  });
  assert.equal(response.status, 200, "license-admin did not return HTTP 200");
  assertSecurityHeaders(response);
  const csp = response.headers.get("content-security-policy") || "";
  assert.ok(csp, "Content-Security-Policy response header is missing");
  const nonce = getNonce(csp);
  const html = await response.text();
  const scripts = html.match(/<script\b[^>]*>/gi) || [];
  assert.ok(scripts.length > 0, "No Next.js script tags were found in rendered HTML");
  const doubleQuoted = 'nonce="' + nonce + '"';
  const singleQuoted = "nonce='" + nonce + "'";
  for (const script of scripts) {
    assert.ok(
      script.includes(doubleQuoted) || script.includes(singleQuoted),
      "A rendered script tag is missing the request nonce: " + script.slice(0, 180),
    );
  }
  return nonce;
}

const baseUrl = String(process.env.LICENSE_ADMIN_BASE_URL || "").replace(/\/$/, "");
if (baseUrl) {
  const firstNonce = await fetchDocument(baseUrl);
  const secondNonce = await fetchDocument(baseUrl);
  assert.notEqual(firstNonce, secondNonce, "CSP nonce must be unique per request");
}

console.log(
  baseUrl
    ? "License-admin nonce CSP + shared security headers runtime smoke PASS"
    : "License-admin nonce CSP shared-baseline static smoke PASS",
);
