-- Atomic online sale/payment/stock writes and optimistic concurrency controls.
-- New migration only; historical migrations are intentionally unchanged.

CREATE OR REPLACE FUNCTION public.create_sale(
  p_sale JSONB,
  p_payments JSONB DEFAULT '[]'::JSONB,
  p_allow_negative_stock BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale_id UUID;
  v_customer_id UUID;
  v_item JSONB;
  v_payment JSONB;
  v_product_id UUID;
  v_qty NUMERIC(14,3);
  v_stock NUMERIC(14,3);
  v_new_stock NUMERIC(14,3);
  v_product_branch UUID;
  v_total NUMERIC(14,2);
  v_paid NUMERIC(14,2);
  v_balance NUMERIC(14,2);
  v_existing_invoice TEXT;
  v_row_count INTEGER;
  v_org_id UUID;
  v_branch_id UUID;
  v_allowed BOOLEAN;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  v_org_id := private.current_user_org_id();
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = v_org_id
      AND user_id = (SELECT auth.uid())
      AND role = ANY (ARRAY['super_admin','admin','manager','cashier']::TEXT[])
  ) INTO v_allowed;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Role is not allowed to create sales' USING ERRCODE = '42501';
  END IF;

  v_sale_id := NULLIF(p_sale->>'id', '')::UUID;
  IF v_sale_id IS NULL THEN
    RAISE EXCEPTION 'Sale id is required' USING ERRCODE = '22023';
  END IF;

  v_total := COALESCE(NULLIF(p_sale->>'total', '')::NUMERIC, 0);
  v_paid := COALESCE(NULLIF(p_sale->>'paid_amount', '')::NUMERIC, 0);
  v_balance := COALESCE(NULLIF(p_sale->>'balance_amount', '')::NUMERIC, 0);
  IF v_total < 0 OR v_paid < 0 OR v_balance < 0 OR round(v_paid + v_balance, 2) <> round(v_total, 2) THEN
    RAISE EXCEPTION 'Invalid sale settlement totals' USING ERRCODE = '22023';
  END IF;

  SELECT invoice_number INTO v_existing_invoice
  FROM public.sales
  WHERE id = v_sale_id
    AND org_id = v_org_id;

  IF FOUND THEN
    IF v_existing_invoice = p_sale->>'invoice_number' THEN
      RETURN jsonb_build_object('sale_id', v_sale_id, 'idempotent', true);
    END IF;
    RAISE EXCEPTION 'Sale id conflict' USING ERRCODE = '23505';
  END IF;

  v_customer_id := NULLIF(p_sale->>'customer_id', '')::UUID;
  v_branch_id := NULLIF(p_sale->>'branch_id', '')::UUID;
  IF v_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches
    WHERE id = v_branch_id AND org_id = v_org_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Branch is outside the current organization' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.sales (
    id, invoice_number, customer_id, customer_name, sale_date,
    subtotal, discount_amount, tax_amount, total, paid_amount, balance_amount,
    status, notes, created_at, updated_at, branch_id, device_id, created_by, version, org_id
  ) VALUES (
    v_sale_id,
    p_sale->>'invoice_number',
    v_customer_id,
    NULLIF(p_sale->>'customer_name', ''),
    COALESCE(NULLIF(p_sale->>'sale_date', '')::TIMESTAMPTZ, now()),
    COALESCE(NULLIF(p_sale->>'subtotal', '')::NUMERIC, 0),
    COALESCE(NULLIF(p_sale->>'discount_amount', '')::NUMERIC, 0),
    COALESCE(NULLIF(p_sale->>'tax_amount', '')::NUMERIC, 0),
    v_total, v_paid, v_balance,
    COALESCE(NULLIF(p_sale->>'status', ''), 'completed'),
    NULLIF(p_sale->>'notes', ''),
    COALESCE(NULLIF(p_sale->>'created_at', '')::TIMESTAMPTZ, now()),
    COALESCE(NULLIF(p_sale->>'updated_at', '')::TIMESTAMPTZ, now()),
    v_branch_id,
    NULLIF(p_sale->>'device_id', '')::UUID,
    (SELECT auth.uid()),
    COALESCE(NULLIF(p_sale->>'version', '')::INTEGER, 1),
    v_org_id
  );

  IF jsonb_typeof(COALESCE(p_sale->'items', '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Sale items must be an array' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_sale->'items', '[]'::JSONB))
  LOOP
    v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
    v_qty := COALESCE(NULLIF(v_item->>'quantity', '')::NUMERIC, 0);
    IF v_product_id IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Sale item product and positive quantity are required' USING ERRCODE = '22023';
    END IF;

    SELECT stock_quantity, branch_id
      INTO v_stock, v_product_branch
    FROM public.products
    WHERE id = v_product_id
      AND org_id = v_org_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found', v_product_id USING ERRCODE = 'P0002';
    END IF;
    IF NOT p_allow_negative_stock AND v_stock < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for product %', v_product_id USING ERRCODE = '23514';
    END IF;

    v_new_stock := round(v_stock - v_qty, 3);
    UPDATE public.products
    SET stock_quantity = v_new_stock,
        updated_at = COALESCE(NULLIF(p_sale->>'updated_at', '')::TIMESTAMPTZ, now()),
        version = version + 1
    WHERE id = v_product_id
      AND org_id = v_org_id;

    INSERT INTO public.sale_items (
      id, sale_id, product_id, product_name, sku, quantity,
      unit_price, cost_price, discount_percent, tax_rate, line_total, org_id
    ) VALUES (
      NULLIF(v_item->>'id', '')::UUID,
      v_sale_id,
      v_product_id,
      v_item->>'product_name',
      NULLIF(v_item->>'sku', ''),
      v_qty,
      COALESCE(NULLIF(v_item->>'unit_price', '')::NUMERIC, 0),
      COALESCE(NULLIF(v_item->>'cost_price', '')::NUMERIC, 0),
      COALESCE(NULLIF(v_item->>'discount_percent', '')::NUMERIC, 0),
      COALESCE(NULLIF(v_item->>'tax_rate', '')::NUMERIC, 0),
      COALESCE(NULLIF(v_item->>'line_total', '')::NUMERIC, 0),
      v_org_id
    );

    INSERT INTO public.inventory_transactions (
      id, product_id, movement_type, quantity, balance_after,
      reference_type, reference_id, notes, created_at, created_by, branch_id, device_id, org_id
    ) VALUES (
      gen_random_uuid(),
      v_product_id,
      'sale',
      v_qty,
      v_new_stock,
      'sale',
      v_sale_id,
      'Atomic sale stock movement',
      COALESCE(NULLIF(p_sale->>'created_at', '')::TIMESTAMPTZ, now()),
      (SELECT auth.uid()),
      COALESCE(v_branch_id, v_product_branch),
      NULLIF(p_sale->>'device_id', '')::UUID,
      v_org_id
    );
  END LOOP;

  IF v_customer_id IS NOT NULL THEN
    UPDATE public.customers
    SET outstanding_balance = round(outstanding_balance + v_balance, 2),
        total_spending = round(total_spending + v_paid, 2),
        updated_at = COALESCE(NULLIF(p_sale->>'updated_at', '')::TIMESTAMPTZ, now()),
        version = version + 1
    WHERE id = v_customer_id
      AND org_id = v_org_id
      AND deleted_at IS NULL;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count <> 1 THEN
      RAISE EXCEPTION 'Customer % not found or not writable', v_customer_id USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF jsonb_typeof(COALESCE(p_payments, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Payments must be an array' USING ERRCODE = '22023';
  END IF;

  FOR v_payment IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_payments, '[]'::JSONB))
  LOOP
    IF COALESCE(NULLIF(v_payment->>'amount', '')::NUMERIC, 0) <= 0 THEN
      RAISE EXCEPTION 'Payment amount must be positive' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.payments (
      id, amount, method, reference_type, reference_id, customer_id, notes,
      paid_at, created_at, created_by, branch_id, device_id, version, org_id
    ) VALUES (
      NULLIF(v_payment->>'id', '')::UUID,
      (v_payment->>'amount')::NUMERIC,
      v_payment->>'method',
      COALESCE(NULLIF(v_payment->>'reference_type', ''), 'sale'),
      v_sale_id,
      v_customer_id,
      NULLIF(v_payment->>'notes', ''),
      COALESCE(NULLIF(v_payment->>'paid_at', '')::TIMESTAMPTZ, now()),
      COALESCE(NULLIF(v_payment->>'created_at', '')::TIMESTAMPTZ, now()),
      (SELECT auth.uid()),
      v_branch_id,
      NULLIF(v_payment->>'device_id', '')::UUID,
      COALESCE(NULLIF(v_payment->>'version', '')::INTEGER, 1),
      v_org_id
    );
  END LOOP;

  RETURN jsonb_build_object('sale_id', v_sale_id, 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_payment(
  p_payment JSONB,
  p_sale_settlements JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment_id UUID;
  v_customer_id UUID;
  v_amount NUMERIC(14,2);
  v_settlement JSONB;
  v_sale_id UUID;
  v_new_version INTEGER;
  v_expected_version INTEGER;
  v_row_count INTEGER;
  v_org_id UUID;
  v_branch_id UUID;
  v_allowed BOOLEAN;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  v_org_id := private.current_user_org_id();
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = v_org_id
      AND user_id = (SELECT auth.uid())
      AND role = ANY (ARRAY['super_admin','admin','manager','cashier']::TEXT[])
  ) INTO v_allowed;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Role is not allowed to record payments' USING ERRCODE = '42501';
  END IF;

  v_payment_id := NULLIF(p_payment->>'id', '')::UUID;
  v_customer_id := NULLIF(p_payment->>'customer_id', '')::UUID;
  v_amount := COALESCE(NULLIF(p_payment->>'amount', '')::NUMERIC, 0);
  v_branch_id := NULLIF(p_payment->>'branch_id', '')::UUID;
  IF v_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches
    WHERE id = v_branch_id AND org_id = v_org_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Branch is outside the current organization' USING ERRCODE = '42501';
  END IF;
  IF v_payment_id IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Payment id and positive amount are required' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.payments WHERE id = v_payment_id AND org_id = v_org_id) THEN
    RETURN jsonb_build_object('payment_id', v_payment_id, 'idempotent', true);
  END IF;

  IF jsonb_typeof(COALESCE(p_sale_settlements, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Sale settlements must be an array' USING ERRCODE = '22023';
  END IF;

  FOR v_settlement IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_sale_settlements, '[]'::JSONB))
  LOOP
    v_sale_id := NULLIF(v_settlement->>'id', '')::UUID;
    v_new_version := COALESCE(NULLIF(v_settlement->>'version', '')::INTEGER, 0);
    v_expected_version := v_new_version - 1;
    IF v_sale_id IS NULL OR v_expected_version < 1 THEN
      RAISE EXCEPTION 'Sale settlement requires id and incremented version' USING ERRCODE = '22023';
    END IF;

    UPDATE public.sales
    SET paid_amount = (v_settlement->>'paid_amount')::NUMERIC,
        balance_amount = (v_settlement->>'balance_amount')::NUMERIC,
        status = v_settlement->>'status',
        updated_at = COALESCE(NULLIF(v_settlement->>'updated_at', '')::TIMESTAMPTZ, now()),
        version = v_new_version
    WHERE id = v_sale_id
      AND org_id = v_org_id
      AND version = v_expected_version
      AND deleted_at IS NULL;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count <> 1 THEN
      RAISE EXCEPTION 'Version conflict for sale %', v_sale_id USING ERRCODE = '40001';
    END IF;
  END LOOP;

  INSERT INTO public.payments (
    id, amount, method, reference_type, reference_id, customer_id, notes,
    paid_at, created_at, created_by, branch_id, device_id, version, org_id
  ) VALUES (
    v_payment_id,
    v_amount,
    p_payment->>'method',
    p_payment->>'reference_type',
    NULLIF(p_payment->>'reference_id', '')::UUID,
    v_customer_id,
    NULLIF(p_payment->>'notes', ''),
    COALESCE(NULLIF(p_payment->>'paid_at', '')::TIMESTAMPTZ, now()),
    COALESCE(NULLIF(p_payment->>'created_at', '')::TIMESTAMPTZ, now()),
    (SELECT auth.uid()),
    v_branch_id,
    NULLIF(p_payment->>'device_id', '')::UUID,
    COALESCE(NULLIF(p_payment->>'version', '')::INTEGER, 1),
    v_org_id
  );

  IF v_customer_id IS NOT NULL THEN
    UPDATE public.customers
    SET outstanding_balance = round(GREATEST(0, outstanding_balance - v_amount), 2),
        total_spending = round(total_spending + v_amount, 2),
        updated_at = COALESCE(NULLIF(p_payment->>'paid_at', '')::TIMESTAMPTZ, now()),
        version = version + 1
    WHERE id = v_customer_id
      AND org_id = v_org_id
      AND deleted_at IS NULL;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count <> 1 THEN
      RAISE EXCEPTION 'Customer % not found or not writable', v_customer_id USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN jsonb_build_object('payment_id', v_payment_id, 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_product_id UUID,
  p_movement_type TEXT,
  p_quantity NUMERIC,
  p_expected_version INTEGER,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_device_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current NUMERIC(14,3);
  v_current_version INTEGER;
  v_new NUMERIC(14,3);
  v_delta NUMERIC(14,3);
  v_product_branch UUID;
  v_org_id UUID;
  v_allowed BOOLEAN;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  v_org_id := private.current_user_org_id();
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = v_org_id
      AND user_id = (SELECT auth.uid())
      AND role = ANY (ARRAY['super_admin','admin','manager']::TEXT[])
  ) INTO v_allowed;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Role is not allowed to adjust stock' USING ERRCODE = '42501';
  END IF;
  IF p_quantity IS NULL OR p_quantity = 0 OR p_expected_version < 1 THEN
    RAISE EXCEPTION 'Non-zero quantity and expected version are required' USING ERRCODE = '22023';
  END IF;

  SELECT stock_quantity, version, branch_id
    INTO v_current, v_current_version, v_product_branch
  FROM public.products
  WHERE id = p_product_id
    AND org_id = v_org_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product % not found', p_product_id USING ERRCODE = 'P0002';
  END IF;
  IF v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'Version conflict for product %', p_product_id USING ERRCODE = '40001';
  END IF;

  CASE p_movement_type
    WHEN 'stock_in' THEN v_delta := abs(p_quantity);
    WHEN 'purchase' THEN v_delta := abs(p_quantity);
    WHEN 'return' THEN v_delta := abs(p_quantity);
    WHEN 'stock_out' THEN v_delta := -abs(p_quantity);
    WHEN 'sale' THEN v_delta := -abs(p_quantity);
    WHEN 'transfer' THEN v_delta := -abs(p_quantity);
    WHEN 'adjustment' THEN v_delta := p_quantity;
    ELSE
      RAISE EXCEPTION 'Unsupported stock movement type %', p_movement_type USING ERRCODE = '22023';
  END CASE;

  v_new := round(v_current + v_delta, 3);

  UPDATE public.products
  SET stock_quantity = v_new,
      updated_at = now(),
      version = v_current_version + 1
  WHERE id = p_product_id
    AND org_id = v_org_id
    AND version = p_expected_version;

  INSERT INTO public.inventory_transactions (
    id, product_id, movement_type, quantity, balance_after,
    reference_type, reference_id, notes, created_at, created_by, branch_id, device_id, org_id
  ) VALUES (
    gen_random_uuid(),
    p_product_id,
    p_movement_type,
    p_quantity,
    v_new,
    p_reference_type,
    p_reference_id,
    p_notes,
    now(),
    (SELECT auth.uid()),
    v_product_branch,
    p_device_id,
    v_org_id
  );

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'stock_quantity', v_new,
    'version', v_current_version + 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_sale(JSONB, JSONB, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_payment(JSONB, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.adjust_stock(UUID, TEXT, NUMERIC, INTEGER, TEXT, UUID, TEXT, UUID, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_sale(JSONB, JSONB, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment(JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stock(UUID, TEXT, NUMERIC, INTEGER, TEXT, UUID, TEXT, UUID, UUID) TO authenticated;
