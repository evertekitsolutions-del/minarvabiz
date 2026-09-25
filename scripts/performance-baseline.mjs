import fs from "node:fs";
import { performance } from "node:perf_hooks";

const baseRaw = String(process.env.STAGING_BASE_URL || "").trim();
if (!baseRaw) throw new Error("STAGING_BASE_URL is required");
const base = new URL(baseRaw.endsWith("/") ? baseRaw : baseRaw + "/");
const policy = JSON.parse(fs.readFileSync(new URL("../security/staging-quality-policy.json", import.meta.url), "utf8"));
const cfg = policy.performance;

function target(pathname) {
  return new URL(pathname.replace(/^\//, ""), base).toString();
}
function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}
function round(value) {
  return Math.round(value * 10) / 10;
}

async function sample(pathname) {
  const start = performance.now();
  const response = await fetch(target(pathname), {
    redirect: "follow",
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
  });
  const headersAt = performance.now();
  const body = new Uint8Array(await response.arrayBuffer());
  const done = performance.now();
  if (!response.ok) throw new Error(`${pathname} returned ${response.status}`);
  if (body.byteLength > cfg.maxDocumentBytes) {
    throw new Error(`${pathname} document is ${body.byteLength} bytes, over ${cfg.maxDocumentBytes}`);
  }
  return { ttfbMs: headersAt - start, totalMs: done - start, bytes: body.byteLength };
}

const report = {};
for (const pathname of policy.documentPaths) {
  for (let i = 0; i < cfg.warmupRequests; i += 1) await sample(pathname);
  const samples = [];
  for (let i = 0; i < cfg.samplesPerPath; i += 1) samples.push(await sample(pathname));
  const ttfb = samples.map((x) => x.ttfbMs);
  const total = samples.map((x) => x.totalMs);
  const p95TtfbMs = percentile(ttfb, 95);
  const p95TotalMs = percentile(total, 95);
  if (p95TtfbMs > cfg.maxP95TtfbMs) {
    throw new Error(`${pathname} p95 TTFB ${round(p95TtfbMs)}ms exceeds baseline ${cfg.maxP95TtfbMs}ms`);
  }
  if (p95TotalMs > cfg.maxP95TotalMs) {
    throw new Error(`${pathname} p95 total ${round(p95TotalMs)}ms exceeds baseline ${cfg.maxP95TotalMs}ms`);
  }
  report[pathname] = {
    p50TtfbMs: round(percentile(ttfb, 50)),
    p95TtfbMs: round(p95TtfbMs),
    p50TotalMs: round(percentile(total, 50)),
    p95TotalMs: round(p95TotalMs),
    maxBytes: Math.max(...samples.map((x) => x.bytes)),
  };
}

console.log("PERFORMANCE_BASELINE PASS", JSON.stringify({
  base: base.origin,
  thresholds: {
    maxP95TtfbMs: cfg.maxP95TtfbMs,
    maxP95TotalMs: cfg.maxP95TotalMs,
    maxDocumentBytes: cfg.maxDocumentBytes,
  },
  report,
}));
