-- M13 online-only, tenant/branch scoped garment rate cards.
-- Reuses permitted MIT Laundry Lo service vocabulary; financial values
-- are always authoritative in Supabase PostgreSQL, never browser storage.
CREATE TABLE IF NOT EXISTS public.laundry_service_rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  mode text NOT NULL CHECK (mode IN ('outsourced','in_house_ironing')),
  service_code text NOT NULL CHECK (service_code IN
    ('wash','dry_clean','steam_iron','iron_fold','starch','special_cleaning')),
  garment text NOT NULL CHECK (length(btrim(garment)) BETWEEN 1 AND 120),
  fabric text NOT NULL CHECK (fabric IN
    ('regular','cotton','silk','wool','delicate','other')),
  supplier_id uuid REFERENCES public.suppliers(id),
  customer_rate numeric(14,2) NOT NULL CHECK (customer_rate BETWEEN 0 AND 999999999999),
  supplier_rate numeric(14,2) NOT NULL CHECK (supplier_rate BETWEEN 0 AND 999999999999),
  tat_hours integer NOT NULL CHECK (tat_hours BETWEEN 1 AND 2160),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT laundry_inhouse_supplier_guard CHECK
    (mode <> 'in_house_ironing' OR (supplier_id IS NULL AND supplier_rate = 0))
);
CREATE UNIQUE INDEX IF NOT EXISTS laundry_rate_cards_scoped_key
ON public.laundry_service_rate_cards (
  org_id, branch_id, mode, service_code, lower(btrim(garment)),
  fabric, coalesce(supplier_id::text,'')
) WHERE deleted_at IS NULL;

ALTER TABLE public.laundry_service_rate_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY laundry_rate_cards_select ON public.laundry_service_rate_cards
  FOR SELECT TO authenticated
  USING (
    org_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.organization_members AS member
      WHERE member.org_id = laundry_service_rate_cards.org_id
        AND member.user_id = (SELECT auth.uid())
    )
  );
CREATE POLICY laundry_rate_cards_insert ON public.laundry_service_rate_cards
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND public.user_has_org_role(org_id, ARRAY['super_admin','admin','manager'])
    AND EXISTS (
      SELECT 1 FROM public.branches AS branch
      WHERE branch.id = branch_id AND branch.org_id = org_id
    )
    AND (supplier_id IS NULL OR EXISTS (
      SELECT 1 FROM public.suppliers AS supplier
      WHERE supplier.id = supplier_id AND supplier.org_id = org_id
    ))
  );
CREATE POLICY laundry_rate_cards_update ON public.laundry_service_rate_cards
  FOR UPDATE TO authenticated
  USING (
    public.user_has_org_role(org_id, ARRAY['super_admin','admin','manager'])
  )
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND public.user_has_org_role(org_id, ARRAY['super_admin','admin','manager'])
    AND EXISTS (
      SELECT 1 FROM public.branches AS branch
      WHERE branch.id = branch_id AND branch.org_id = org_id
    )
    AND (supplier_id IS NULL OR EXISTS (
      SELECT 1 FROM public.suppliers AS supplier
      WHERE supplier.id = supplier_id AND supplier.org_id = org_id
    ))
  );
REVOKE ALL ON public.laundry_service_rate_cards FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.laundry_service_rate_cards TO authenticated;
