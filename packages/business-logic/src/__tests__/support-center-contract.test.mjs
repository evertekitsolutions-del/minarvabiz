import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const nav = read("packages/ui/src/lib/nav.ts");
const ui = read("packages/ui/src/components/support/SupportCenter.tsx");
const server = read("apps/web/src/lib/support-server.ts");
const chatRoute = read("apps/web/src/app/api/support/chat/route.ts");
const feedbackRoute = read("apps/web/src/app/api/support/feedback/route.ts");
const adminActions = read("apps/license-admin/src/app/actions.ts");
const adminInbox = read("apps/license-admin/src/app/admin-panel/SupportInboxCard.tsx");
const migration = read("supabase/migrations/20260927_ai_support_center.sql");
const release = read(".github/workflows/release-windows.yml");
const docs = read("docs/AI_SUPPORT_CENTER.md");

assert.match(nav, /"support"/);
assert.match(nav, /AI Support Center/);

assert.match(ui, /AI Technical Support/);
assert.match(ui, /Ideas & Feature Requests/);
assert.match(ui, /Attach screenshot/);
assert.match(ui, /Share redacted diagnostics/);
assert.match(ui, /Escalate to Support/);
assert.match(ui, /Send to Product Team/);
assert.match(ui, /compressScreenshot/);
assert.match(ui, /license token/i);

assert.match(server, /api\.openai\.com\/v1\/responses/);
assert.match(server, /input_image/);
assert.match(server, /OPENAI_API_KEY/);
assert.match(server, /MINARVA_SUPPORT_AI_MODEL/);
assert.match(server, /gpt-5\.6-luna/);
assert.match(server, /docs\/FINAL_COMPLETION\.md/);
assert.match(server, /GitHub latest release/);
assert.match(server, /GitHub recent main commits/);
assert.match(server, /consume_license_rate_limit/);
assert.match(server, /SUPPORT_RATE_LIMIT_SECRET/);
assert.match(server, /Never ask for or expose license tokens/);
assert.equal(server.includes("NEXT_PUBLIC_OPENAI"), false);

assert.match(chatRoute, /support-chat-minute/);
assert.match(chatRoute, /support-chat-hour/);
assert.match(chatRoute, /answerTechnicalSupport/);
assert.match(feedbackRoute, /support-submit-day/);
assert.match(feedbackRoute, /createSupportRequest/);
assert.match(feedbackRoute, /triageSupportRequest/);

assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.support_requests/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /REVOKE ALL ON TABLE public\.support_requests FROM PUBLIC, anon, authenticated/);
assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.support_requests TO service_role/);
assert.match(migration, /feature_request/);
assert.match(migration, /technical_escalation/);

assert.match(adminActions, /listSupportRequests/);
assert.match(adminActions, /updateSupportRequest/);
assert.match(adminInbox, /Support Inbox/);
assert.match(adminInbox, /AI triage/);
assert.match(adminInbox, /Internal notes/);

assert.match(release, /VITE_SUPPORT_API_URL/);
assert.match(release, /https:\/\/minarvabiz-steel\.vercel\.app/);

assert.match(docs, /does not persist raw screenshot bytes/i);
assert.match(docs, /Viewer: read-only Support Inbox/);
assert.match(docs, /OPENAI_API_KEY/);

console.log("AI Support Center contract PASS");
