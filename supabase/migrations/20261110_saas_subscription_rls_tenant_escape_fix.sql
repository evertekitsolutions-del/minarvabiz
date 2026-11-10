-- P0: Fix cross-tenant SaaS subscription reads and cross-org laundry foreign references.
-- Existing policies compared an alias to itself (m.org_id = m.org_id), which
-- permitted a member of ANY organization to read ALL organizations' rows.
-- Idempotent ALTER POLICY preserves existing grants and blocks direct writes.
alter policy saas_tenant_subscriptions_tenant_read
 on public.saas_tenant_subscriptions
 using (exists (
   select 1 from public.organization_members as member
   where member.org_id = saas_tenant_subscriptions.org_id
     and member.user_id = (select auth.uid())
 ));
alter policy saas_subscription_intents_tenant_read
 on public.saas_subscription_checkout_intents
 using (exists (
   select 1 from public.organization_members as member
   where member.org_id = saas_subscription_checkout_intents.org_id
     and member.user_id = (select auth.uid())
 ));
alter policy saas_subscription_receipts_tenant_read
 on public.saas_subscription_payment_receipts
 using (exists (
   select 1 from public.organization_members as member
   where member.org_id = saas_subscription_payment_receipts.org_id
     and member.user_id = (select auth.uid())
 ));
alter policy saas_subscription_state_events_tenant_read
 on public.saas_subscription_state_events
 using (exists (
   select 1 from public.organization_members as member
   where member.org_id = saas_subscription_state_events.org_id
     and member.user_id = (select auth.uid())
 ));
-- A rate card can reference only a branch/supplier belonging to its own org.
alter policy laundry_rate_cards_insert on public.laundry_service_rate_cards
 with check (
  created_by = (select auth.uid())
  and public.user_has_org_role(org_id, array['super_admin','admin','manager'])
  and exists (
   select 1 from public.branches branch
   where branch.id = laundry_service_rate_cards.branch_id
     and branch.org_id = laundry_service_rate_cards.org_id
  )
  and (supplier_id is null or exists (
   select 1 from public.suppliers supplier
   where supplier.id = laundry_service_rate_cards.supplier_id
     and supplier.org_id = laundry_service_rate_cards.org_id
  ))
 );
alter policy laundry_rate_cards_update on public.laundry_service_rate_cards
 with check (
  created_by = (select auth.uid())
  and public.user_has_org_role(org_id, array['super_admin','admin','manager'])
  and exists (
   select 1 from public.branches branch
   where branch.id = laundry_service_rate_cards.branch_id
     and branch.org_id = laundry_service_rate_cards.org_id
  )
  and (supplier_id is null or exists (
   select 1 from public.suppliers supplier
   where supplier.id = laundry_service_rate_cards.supplier_id
     and supplier.org_id = laundry_service_rate_cards.org_id
  ))
 );
