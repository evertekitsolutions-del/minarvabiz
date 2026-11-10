import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync("supabase/migrations/20261110_saas_tenant_backup_validate.sql","utf8");
const ui=readFileSync("apps/web/src/app/(app)/backup/saas-tenant-cloud-backup-panel.tsx","utf8");
test("M4 backup SQL is tenant-scoped admin only, bounded, hashed and non-destructive",()=>{
 for(const x of [
 /saas_tenant_backup_export/,/saas_tenant_backup_validate/,
 /user_has_org_role\(v_org,ARRAY\['super_admin','admin'\]\)/,
 /p_row_limit>2000/,/pg_catalog\.sha256/,
 /v_hash IS DISTINCT FROM p_archive->>'sha256'/,
 /v_count<>v_ids/,/x->>'org_id' IS DISTINCT FROM v_org::text/,
 /v_invalid>0/,/'restore_applied',false/,
 /REVOKE ALL ON FUNCTION public\.saas_tenant_backup_export/,
 /REVOKE ALL ON FUNCTION public\.saas_tenant_backup_validate/
 ])assert.match(sql,x);
 assert.doesNotMatch(sql,/\bINSERT INTO public\.|\bUPDATE public\.|\bDELETE FROM public\./);
 assert.doesNotMatch(sql,/CREATE POLICY .*anon/);
});
test("M4 backup page offers JSON/CSV with formula-injection escaping and server preflight",()=>{
 const page=readFileSync("apps/web/src/app/(app)/backup/page.tsx","utf8");
 assert.match(page,/SaasTenantCloudBackupPanel/);
 for(const x of [
  /saas_tenant_backup_export/,/saas_tenant_backup_validate/,
  /archive\.org_id!==a\.org/,/archive\.sha256/,
  /restore_applied!==false/,/minarva-cloud-/,/Export verified JSON/,
  /Export CSV/,/File/,/12\*1024\*1024/,/safeCell/,
  /getOutboxScope/,/window\.confirm/,/can\("backup\.manage"\)/
 ])assert.match(ui,x);
});
