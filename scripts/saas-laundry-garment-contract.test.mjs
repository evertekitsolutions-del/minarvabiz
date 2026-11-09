import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { qrMatrix } from "../packages/business-logic/src/qr-code.ts";

test("garment tag QR encodes deterministic per-job reference, no customer PII",()=>{
 const a=qrMatrix("MB-QA20261109A"), b=qrMatrix("MB-QA20261109A");
 assert.deepEqual(a,b);
 assert.ok(a.length>=21&&a.every(row=>row.length===a.length));
});
test("cloud garment intake and stage lifecycle are RLS guarded, append-only audit",()=>{
 const sql=readFileSync("supabase/migrations/20261109_saas_laundry_garment_lifecycle.sql","utf8");
 for(const expr of [
  /ENABLE ROW LEVEL SECURITY/g,
  /saas_laundry_jobs_select/,/saas_laundry_jobs_insert/,
  /CREATE OR REPLACE FUNCTION public\.saas_laundry_intake/,
  /CREATE OR REPLACE FUNCTION public\.saas_laundry_step/,
  /SECURITY INVOKER/,/private\.saas_laundry_event_after_write/,
  /UNIQUE\(job_id,version\)/,
  /Invalid or forged laundry garment state change/,
 ])assert.match(sql,expr);
 assert.doesNotMatch(sql,/GRANT\s+[^;]*DELETE\s+ON\s+public\.saas_laundry_garment_jobs/);
});
test("laundry UI requires durable RPC and verified reload for intake/transition",()=>{
 const f=readFileSync("apps/web/src/app/(app)/laundry/saas-garment-workflow.tsx","utf8");
 const page=readFileSync("apps/web/src/app/(app)/laundry/page.tsx","utf8");
 assert.match(page,/<SaasGarmentWorkflow\s*\/>/);
 assert.match(f,/await pgRpc<Record<string,unknown>>\(ctx.cfg,"saas_laundry_intake"/);
 assert.match(f,/await pgRpc<Record<string,unknown>>\(ctx.cfg,"saas_laundry_step"/);
 assert.match(f,/const check=await pgSelect<Job>/);
 assert.match(f,/hasUnchangedSession/);
 assert.match(f,/qrMatrix\(tag\)/);
});
