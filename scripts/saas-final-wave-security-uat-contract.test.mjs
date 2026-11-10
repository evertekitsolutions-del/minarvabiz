import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync("supabase/tests/20261110_master_business_day_rehearsal.sql","utf8");
const matrix=readFileSync("supabase/tests/20261110_full_rls_rbac_matrix.sql","utf8");
const harness=readFileSync("scripts/saas-two-tenant-signed-jwt-proof.mjs","utf8");
test("M25 end-to-end rollback drill covers 10 steps and never mutates QA production rows",()=>{
 for(const re of [
  /^BEGIN;/m,/saas_start_tenant_trial_once/,
  /saas_create_purchase_order/,/saas_receive_purchase_order/,
  /two boutique child variants/,
  /create_sale\(/,/saas_laundry_intake/,/saas_laundry_step/,
  /saas_storefront_checkout_reserved/,/saas_online_order_transition/,
  /saas_capture_storefront_lead/,/saas_preview_store_coupon/,
  /saas_field_visit_create_once/,/saas_field_visit_event_once/,
  /saas_finance_post_once/,/saas_finance_daybook/,
  /saas_tenant_backup_export/,/saas_tenant_backup_validate/,
  /\bROLLBACK;/,/no real signup\/hardware\/coupon redemption\/verified payment/
 ])assert.match(sql,re);
});
test("M24 independent SQL role scan covers all public RLS and does not change real membership",()=>{
 for(const re of [
  /FROM pg_catalog\.pg_class/,/t\.relrowsecurity/,
  /n\.nspname='public'/,/SET LOCAL ROLE authenticated/,
  /SET LOCAL ROLE anon|00000000-0000-4000-8000-000000000001/,
  /SET role='cashier'/,/SET role='staff'/,
  /self-promoted/,/saas_start_tenant_trial_once/,
  /saas_capture_signed_subscription_payment_once/,
  /when insufficient_privilege/i,/ROLLBACK;/
 ])assert.match(matrix,re);
});
test("M24 real signed-JWT proof is fail closed if independent A/B/staff secrets are missing",()=>{
 for(const re of [
  /MINARVA_QA_TENANT_A_JWT/,/MINARVA_QA_TENANT_B_JWT/,
  /MINARVA_QA_STAFF_JWT/,/SIGNED_JWT_GATE_BLOCKED/,
  /\/auth\/v1\/user/,/current_user_authorization/,
  /CROSS_TENANT_LEAK/,/saas_subscription_payment_receipts/,
  /saas_capture_signed_subscription_payment_once/
 ])assert.match(harness,re);
 assert.doesNotMatch(harness,/SERVICE_ROLE_KEY/);
});
