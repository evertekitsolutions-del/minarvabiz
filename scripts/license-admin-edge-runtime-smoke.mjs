import assert from "node:assert/strict";
import { licenseEdgeOrigin } from "../apps/license-admin/src/app/admin-panel/license-edge-config.ts";

const previous = process.env.NEXT_PUBLIC_LICENSE_EDGE_URL;
const oldWindow = globalThis.window;
try {
  process.env.NEXT_PUBLIC_LICENSE_EDGE_URL = "https://stale-account.workers.dev";
  for (const hostname of [
    "minarvabiz-license-admin.pages.dev",
    "minarvabiz-license-admin-anil.pages.dev",
  ]) {
    globalThis.window = { location: { hostname } };
    assert.equal(
      licenseEdgeOrigin(),
      "https://minarva-biz-license-edge.anilalbert7.workers.dev",
      "Production admin must not inherit a legacy build-time Cloudflare Worker origin",
    );
  }
  globalThis.window = { location: { hostname: "custom-admin.example.com" } };
  assert.equal(
    licenseEdgeOrigin(),
    "https://stale-account.workers.dev",
    "Self-hosted customer deployments retain a configurable Worker origin",
  );
  delete globalThis.window;
  assert.equal(
    licenseEdgeOrigin(),
    "https://stale-account.workers.dev",
    "Server rendering retains environment origin fallback",
  );
} finally {
  if (previous == null) delete process.env.NEXT_PUBLIC_LICENSE_EDGE_URL;
  else process.env.NEXT_PUBLIC_LICENSE_EDGE_URL = previous;
  if (oldWindow == null) delete globalThis.window;
  else globalThis.window = oldWindow;
}
console.log("Admin canonical Worker origin override smoke PASS");
