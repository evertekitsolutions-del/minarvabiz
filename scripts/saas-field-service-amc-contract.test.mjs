import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync("supabase/migrations/20261110_saas_field_service_amc.sql","utf8");
const ui=readFileSync("apps/web/src/app/(app)/field-service/saas-field-service-panel.tsx","utf8");
const page=readFileSync("apps/web/src/app/(app)/field-service/page.tsx","utf8");
test("M19 visit/checklist/photo/signature/AMC RPCs tenant private and replay-safe",()=>{
 for(const regex of [
  /CREATE TABLE IF NOT EXISTS public\.saas_field_visits/,
  /CREATE TABLE IF NOT EXISTS public\.saas_field_visit_events/,
  /CREATE TABLE IF NOT EXISTS public\.saas_amc_agreements/,
  /ENABLE ROW LEVEL SECURITY/g,
  /saas_field_one_handover_per_visit/,
  /saas_field_visit_create_once/,
  /saas_field_visit_event_once/,
  /saas_amc_create_once/,
  /pg_advisory_xact_lock/,
  /user_has_org_role/,
  /request_body IS DISTINCT FROM p_payload/,
  /'checklist','evidence','handover'/,
  /'https:\/\/'/,
  /signature_png/,
  /completed_at=now\(\)/,
  /REVOKE ALL ON public\.saas_field_visits/,
  /GRANT SELECT ON public\.saas_field_visits/,
 ])assert.match(sql,regex);
 assert.doesNotMatch(sql,/GRANT (INSERT|UPDATE|DELETE) ON public\.saas_field_visits/);
});
test("M19 tenant UI links and readback checks all four real visit steps",()=>{
 const services=readFileSync("apps/web/src/app/(app)/services/page.tsx","utf8");
 assert.match(page,/SaasFieldServicePanel/);
 assert.match(services,/href="\/field-service"/);
 for(const regex of [
  /saas_field_visit_create_once/,/saas_field_visit_event_once/,/saas_amc_create_once/,
  /SaasFieldServicePanel/,/request.jwt|resolveOnlineAuthorization/,
  /getOutboxScope/,/can\("orders.manage"\)/,
  /onPointerDown/,/onPointerMove/,/toDataURL\("image\/png"\)/,
  /p_payload:payload/,/p_scheduled_at/,
  /saas_field_visit_events/,/saas_amc_agreements/,
  /pending\.current\[key\]/,
 ])assert.match(ui,regex);
});
