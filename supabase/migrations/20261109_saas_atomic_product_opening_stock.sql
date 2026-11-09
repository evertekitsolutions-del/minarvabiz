-- SaaS-only, invoker-scoped atomic catalog creation and opening inventory.
-- One PostgreSQL transaction commits BOTH product and stock ledger or neither.
CREATE OR REPLACE FUNCTION public.create_product_with_opening_stock(
  p_product_id uuid,
  p_name text,
  p_sku text,
  p_barcode text,
  p_category_id uuid,
  p_unit text,
  p_cost_price numeric,
  p_selling_price numeric,
  p_stock_quantity numeric,
  p_minimum_stock numeric,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_org uuid;
  v_inserted uuid;
  v_product public.products%ROWTYPE;
  v_receipts integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authenticated tenant account required' USING ERRCODE = '42501';
  END IF;
  v_org := private.current_user_org_id();
  IF v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organization_members AS m
    WHERE m.org_id = v_org AND m.user_id = v_user
      AND m.role = ANY (ARRAY['super_admin','admin','manager']::text[])
  ) THEN
    RAISE EXCEPTION 'Tenant product creation is not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_product_id IS NULL OR nullif(btrim(p_name), '') IS NULL
     OR nullif(btrim(p_unit), '') IS NULL OR p_is_active IS NULL
     OR p_cost_price IS NULL OR p_selling_price IS NULL
     OR p_stock_quantity IS NULL OR p_minimum_stock IS NULL
     OR p_cost_price < 0 OR p_selling_price < 0
     OR p_stock_quantity < 0 OR p_minimum_stock < 0
     OR p_stock_quantity > 999999999 OR p_minimum_stock > 999999999
     OR p_cost_price > 999999999999 OR p_selling_price > 999999999999 THEN
    RAISE EXCEPTION 'Invalid catalog/stock input' USING ERRCODE = '22023';
  END IF;
  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.categories AS c
    WHERE c.id = p_category_id AND c.org_id = v_org AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Category does not belong to the current tenant'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.products (
    id, org_id, name, sku, barcode, category_id, unit, cost_price,
    selling_price, stock_quantity, minimum_stock, is_active, version
  ) VALUES (
    p_product_id, v_org, p_name, p_sku, p_barcode, p_category_id, p_unit,
    p_cost_price, p_selling_price, p_stock_quantity, p_minimum_stock, p_is_active, 1
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_inserted;

  SELECT * INTO v_product FROM public.products
  WHERE id = p_product_id AND org_id = v_org AND deleted_at IS NULL;
  IF NOT FOUND OR v_product.version <> 1
      OR v_product.name IS DISTINCT FROM p_name
      OR v_product.sku IS DISTINCT FROM p_sku
      OR v_product.barcode IS DISTINCT FROM p_barcode
      OR v_product.category_id IS DISTINCT FROM p_category_id
      OR v_product.unit IS DISTINCT FROM p_unit
      OR v_product.cost_price IS DISTINCT FROM p_cost_price
      OR v_product.selling_price IS DISTINCT FROM p_selling_price
      OR v_product.stock_quantity IS DISTINCT FROM p_stock_quantity
      OR v_product.minimum_stock IS DISTINCT FROM p_minimum_stock
      OR v_product.is_active IS DISTINCT FROM p_is_active THEN
    RAISE EXCEPTION 'Product ID exists with different data or inaccessible owner'
      USING ERRCODE = '23505';
  END IF;

  IF v_inserted IS NOT NULL AND p_stock_quantity > 0 THEN
    INSERT INTO public.inventory_transactions (
      product_id, movement_type, quantity, balance_after, reference_type,
      reference_id, notes, created_by, branch_id, org_id
    ) VALUES (
      p_product_id, 'adjustment', p_stock_quantity, p_stock_quantity,
      'opening_stock', p_product_id, 'Atomic opening inventory',
      v_user, v_product.branch_id, v_org
    );
  END IF;

  IF p_stock_quantity > 0 THEN
    SELECT count(*) INTO v_receipts FROM public.inventory_transactions AS t
    WHERE t.product_id = p_product_id AND t.org_id = v_org
      AND t.reference_type = 'opening_stock' AND t.reference_id = p_product_id
      AND t.movement_type = 'adjustment'
      AND t.quantity = p_stock_quantity
      AND t.balance_after = p_stock_quantity;
    IF v_receipts <> 1 THEN
      RAISE EXCEPTION 'Atomic opening stock receipt missing or duplicated'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN jsonb_build_object('id', p_product_id, 'org_id', v_org, 'version', 1,
                            'stock_quantity', p_stock_quantity);
END;
$$;

REVOKE ALL ON FUNCTION public.create_product_with_opening_stock(
  uuid,text,text,text,uuid,text,numeric,numeric,numeric,numeric,boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_product_with_opening_stock(
  uuid,text,text,text,uuid,text,numeric,numeric,numeric,numeric,boolean
) TO authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_one_opening_receipt_per_product
ON public.inventory_transactions (org_id, product_id, reference_type, reference_id)
WHERE reference_type = 'opening_stock' AND reference_id IS NOT NULL;
