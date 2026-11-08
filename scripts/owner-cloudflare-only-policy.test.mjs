import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("explicit owner provider exclusions are persisted and first-read for all coding agents", () => {
  const rules = read("docs/OWNER_NON_NEGOTIABLE_RULES.md");
  const agents = read("AGENTS.md");
  assert.match(rules, /NO VERCEL\. NO RENDER\./);
  assert.match(rules, /Cloudflare is the approved current hosting\/deployment platform/);
  assert.match(rules, /browser Online, truly bidirectional Hybrid/);
  assert.match(rules, /data.*backup|backup.*data/i);
  assert.match(rules, /25 paying customers/);
  assert.match(rules, /Mandatory agent preflight/i);
  assert.match(agents, /MANDATORY FIRST READ/);
  assert.match(agents, /docs\/OWNER_NON_NEGOTIABLE_RULES\.md/);
  assert.match(agents, /banned \*\*all Vercel and Render use/);
});

test("Cloudflare customer Worker is configured without silently re-enabling Vercel/Render", () => {
  const wrangler = JSON.parse(read("apps/web/wrangler.jsonc"));
  assert.match(wrangler.name, /^minarvabiz-customer-web/);
  assert.equal(wrangler.workers_dev, true);
  assert.ok(wrangler.assets?.directory, "Customer Worker needs static asset binding");
});
