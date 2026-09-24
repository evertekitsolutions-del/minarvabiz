import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const migrationsDir = path.join(root, "supabase/migrations");
const compatibility = "0025_create_sale_returns.sql";
const tenantRls = "003_tenant_rls.sql";

assert.ok(compatibility.localeCompare(tenantRls) < 0, "sale_returns compatibility migration must run before 003_tenant_rls.sql");

const compatSql = fs.readFileSync(path.join(migrationsDir, compatibility), "utf8");
const tenantSql = fs.readFileSync(path.join(migrationsDir, tenantRls), "utf8");

assert.match(compatSql, /CREATE TABLE IF NOT EXISTS public\.sale_returns/);
assert.match(compatSql, /ALTER TABLE public\.sale_returns ENABLE ROW LEVEL SECURITY/);
assert.match(tenantSql, /ALTER TABLE sale_returns ADD COLUMN IF NOT EXISTS org_id/);
assert.match(tenantSql, /'staff_members','sale_returns','audit_logs'/);

console.log("fresh DB sale_returns migration order contract passed");
