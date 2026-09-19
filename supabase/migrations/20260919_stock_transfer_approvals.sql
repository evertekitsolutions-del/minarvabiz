-- Stock transfer request/approval workflow for multi-branch inventory.
-- Keeps pending requests persistent across Online, Offline snapshot, and Hybrid sync.

CREATE TABLE IF NOT EXISTS public.stock_transfer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number TEXT NOT NULL,
  source_product_id UUID NOT NULL REFERENCES public.products(id),
  destination_product_id UUID NOT NULL REFERENCES public.products(id),
  source_branch_id UUID NULL REFERENCES public.branches(id),
  destination_branch_id UUID NULL REFERENCES public.branches(id),
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  notes TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_by UUID NULL REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ NULL,
  approved_by UUID NULL REFERENCES auth.users(id),
  cancelled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  org_id UUID NULL REFERENCES public.organizations(id),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_transfer_requests_org_reference
  ON public.stock_transfer_requests(org_id, reference_number);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_requests_org_status
  ON public.stock_transfer_requests(org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_requests_source
  ON public.stock_transfer_requests(source_product_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_requests_destination
  ON public.stock_transfer_requests(destination_product_id, status);

ALTER TABLE public.stock_transfer_requests ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_current_user_org_id ON public.stock_transfer_requests;
CREATE TRIGGER set_current_user_org_id
  BEFORE INSERT ON public.stock_transfer_requests
  FOR EACH ROW EXECUTE FUNCTION private.set_current_user_org_id();

DROP POLICY IF EXISTS stock_transfer_requests_org_access ON public.stock_transfer_requests;
CREATE POLICY stock_transfer_requests_org_access
  ON public.stock_transfer_requests
  FOR ALL TO authenticated
  USING (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.org_id = stock_transfer_requests.org_id
        AND om.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.org_id = stock_transfer_requests.org_id
        AND om.user_id = (SELECT auth.uid())
    )
  );
