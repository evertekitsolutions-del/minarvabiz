import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const plans=readFileSync("supabase/migrations/20261110_saas_commercial_plans_trial_referral.sql","utf8");
const guard=readFileSync("supabase/migrations/20261110_saas_commerce_entitlement_guard.sql","utf8");
const ui=readFileSync("apps/web/src/app/(app)/billing/page.tsx","utf8");
const signup=readFileSync("apps/web/src/app/register/page.tsx","utf8");
const complete=readFileSync("apps/web/src/app/register/complete/page.tsx","utf8");
test("M20 four approved annual plans, 30-day persisted trial, immutable partner attribution",()=>{
 for(const [code,price] of [
  ["base",2299],["growth",4499],["website",6699],["commerce",8899],
 ])assert.match(plans,new RegExp("'"+code+"'[^\\n]*"+price));
 for(const re of [
  /saas_annual_plans/,/saas_partner_codes/,/saas_partner_referrals/,
  /referred_org_id uuid NOT NULL UNIQUE/,
  /saas_tenant_subscriptions/,/interval '30 days'/,
  /saas_start_tenant_trial_once/,/saas_register_partner_code_once/,
  /user_has_org_role/,/v_partner\.partner_org_id=v_org/,
  /GRANT SELECT ON public\.saas_partner_codes/,
 ])assert.match(plans,re);
 assert.match(signup,/requested_partner_code/);
 assert.match(complete,/saas_start_tenant_trial_once/);
 assert.match(complete,/email_confirmed_at/);
});
test("M21 legal subscription transitions and database deny-by-plan commerce guard",()=>{
 for(const re of [
  /trial','pending_payment','active','grace_period','expired','cancelled'/,
  /saas_transition_tenant_subscription_state/,
  /verified paid receipt required/i,/saas_subscription_entitled/,
  /saas_advance_due_subscription_state/,
  /interval '7 days'/,/payment_environment='live'/,
  /REVOKE ALL ON FUNCTION public\.saas_register_partner_code_once/,
 ])assert.match(plans,re);
 for(const re of [
  /saas_precommercial_legacy_tenants/,
  /INSERT INTO public\.saas_precommercial_legacy_tenants\(org_id\)/,
  /saas_entitled_for_org_internal/,/p_feature/,
  /saas_storefront_entitlement_trg/,
  /saas_storefront_checkout_entitlement_trg/,
  /saas_storefront_listings_entitlement_trg/,
  /'ecommerce'/,/ENABLE ROW LEVEL SECURITY/
 ])assert.match(guard,re);
 assert.match(ui,/saas_subscription_entitled/);
 assert.match(ui,/saas_register_partner_code_once/);
 assert.match(ui,/saas_start_tenant_trial_once/);
 assert.match(ui,/\/api\/billing\/checkout/);
 assert.match(ui,/signed webhook/);
});
