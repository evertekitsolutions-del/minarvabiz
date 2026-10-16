import assert from "node:assert/strict";

const target = "https://minarvabiz-design-review.minarva-biz.workers.dev/";
let lastError;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const response = await fetch(target, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      headers: { Accept: "text/html" },
    });
    assert.equal(response.status, 200, "Cloudflare visual review must return HTTP 200");
    assert.match(response.headers.get("content-type") || "", /text\/html/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-minarva-preview"), "design-review-only");
    assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    const html = await response.text();
    assert.ok(html.includes("DESIGN REVIEW PREVIEW"), "Page must show the demo-only disclosure");
    for (const anchor of ["tour", "features", "industries", "editions", "download"]) {
      assert.ok(html.includes('id="' + anchor + '"'), "Missing live section: " + anchor);
    }
    for (const flow of ["billing", "stock", "service", "reports"]) {
      assert.ok(html.includes('data-tab="' + flow + '"'), "Live tour missing tab: " + flow);
    }
    assert.ok(html.includes("not an actual customer screenshot"));
    assert.doesNotMatch(html, /sb_secret_|BEGIN (?:RSA |EC )?PRIVATE KEY/);
    console.log("Live external Cloudflare design review preview HTTP smoke PASS:", target);
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
  }
}
console.error("Cloudflare design review live smoke FAIL:", String(lastError));
process.exitCode = 1;
