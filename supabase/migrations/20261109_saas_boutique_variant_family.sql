-- M6 online-only boutique variant family: atomic parent/children/stock receipts.
-- Adapted to Minarva's tables from Open Mercato MIT variant option model.
-- Requires normal tenant RLS policies and authenticated user membership.

CREATE UNIQUE INDEX IF NOT EXISTS products_org_active_sku_unique
ON public.products (org_id, lower(btrim(sku)))
WHERE sku IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS products_org_active_barcode_unique
ON public.products (org_id, lower(btrim(barcode)))
WHERE barcode IS NOT NULL AND deleted_at IS NULL;

-- Reject a forged direct REST PATCH that tries to overwrite derived parent
-- inventory without reconciling the actual independently-stocked child SKUs.
CREATE OR REPLACE FUNCTION public.boutique_prevent_parent_stock_drift()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $
DECLARE
  v_sum numeric;
BEGIN
  IF NEW.parent_product_id IS NULL AND NEW.has_variants IS TRUE
     AND NEW.stock_quantity IS DISTINCT FROM OLD.stock_quantity THEN
    SELECT coalesce(sum(child.stock_quantity),0) INTO v_sum
    FROM public.products child
    WHERE child.parent_product_id = NEW.id AND child.deleted_at IS NULL;
    IF NEW.stock_quantity IS DISTINCT FROM v_sum THEN
      RAISE EXCEPTION 'Parent stock must equal sum of independently stocked variants'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$;

DO $
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.products'::regclass
       AND tgname = 'boutique_block_parent_stock_drift') THEN
    CREATE TRIGGER boutique_block_parent_stock_drift
      BEFORE UPDATE OF stock_quantity ON public.products
      FOR EACH ROW EXECUTE FUNCTION public.boutique_prevent_parent_stock_drift();
  END IF;
END $;

CREATE OR REPLACE FUNCTION public.boutique_refresh_parent_stock(p_parent_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF p_parent_id IS NULL THEN RETURN; END IF;
  WITH actual AS (
    SELECT coalesce(sum(child.stock_quantity), 0) AS qty
    FROM public.products AS child
    WHERE child.parent_product_id = p_parent_id AND child.deleted_at IS NULL
  )
  UPDATE public.products AS parent
  SET stock_quantity = actual.qty, updated_at = now(), version = parent.version + 1
  FROM actual
  WHERE parent.id = p_parent_id AND parent.parent_product_id IS NULL
    AND parent.has_variants IS TRUE
    AND parent.stock_quantity IS DISTINCT FROM actual.qty;
END;
$$;

CREATE OR REPLACE FUNCTION public.boutique_variant_stock_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_new_parent uuid;
  v_old_parent uuid;
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    v_old_parent := OLD.parent_product_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_parent := NEW.parent_product_id;
  END IF;
  IF v_old_parent IS NOT NULL AND v_old_parent IS DISTINCT FROM v_new_parent THEN
    PERFORM public.boutique_refresh_parent_stock(v_old_parent);
  END IF;
  IF v_new_parent IS NOT NULL THEN
    PERFORM public.boutique_refresh_parent_stock(v_new_parent);
  ELSIF v_old_parent IS NOT NULL THEN
    PERFORM public.boutique_refresh_parent_stock(v_old_parent);
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.products'::regclass
      AND tgname = 'boutique_variant_stock_reconcile'
  ) THEN
    CREATE TRIGGER boutique_variant_stock_reconcile
    AFTER INSERT OR UPDATE OR DELETE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.boutique_variant_stock_trigger();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_boutique_variant_family(
  p_parent_id uuid,
  p_name text,
  p_sku text,
  p_category_id uuid,
  p_unit text,
  p_minimum_stock numeric,
  p_variants jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_org uuid;
  v_branch uuid;
  v_inserted uuid;
  v_parent public.products%ROWTYPE;
  v_child public.products%ROWTYPE;
  v_entry jsonb;
  v_id uuid;
  v_brand text;
  v_fabric text;
  v_color text;
  v_size text;
  v_name text;
  v_sku text;
  v_barcode text;
  v_cost numeric;
  v_price numeric;
  v_qty numeric;
  v_key text;
  v_seen_ids uuid[] := ARRAY[]::uuid[];
  v_seen_keys text[] := ARRAY[]::text[];
  v_expected numeric := 0;
  v_actual numeric;
  v_count integer;
  v_receipts integer;
BEGIN
  IF v_user IS NULL OR p_parent_id IS NULL THEN
    RAISE EXCEPTION 'Signed-in user and stable parent ID required' USING ERRCODE = '42501';
  END IF;
  SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
  IF v_org IS NULL OR NOT public.user_has_org_role(
    v_org, ARRAY['super_admin','admin','manager']
  ) THEN
    RAISE EXCEPTION 'Tenant administrator permission required' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 200
     OR p_unit IS NULL OR length(btrim(p_unit)) NOT BETWEEN 1 AND 30
     OR p_minimum_stock IS NULL OR p_minimum_stock < 0
     OR p_minimum_stock > 999999999 OR p_variants IS NULL
     OR jsonb_typeof(p_variants) <> 'array'
     OR jsonb_array_length(p_variants) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid boutique variant family input' USING ERRCODE = '22023';
  END IF;
  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = p_category_id AND c.org_id = v_org AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Category belongs to a different business' USING ERRCODE = '42501';
  END IF;
  SELECT branch.id INTO v_branch FROM public.branches AS branch
  WHERE branch.org_id = v_org AND branch.is_headquarters IS TRUE
    AND branch.is_active IS TRUE
  ORDER BY branch.id LIMIT 1;
  IF v_branch IS NULL THEN
    RAISE EXCEPTION 'Verified headquarters branch required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.products (
    id,org_id,branch_id,name,sku,barcode,category_id,unit,cost_price,
    selling_price,stock_quantity,minimum_stock,is_active,has_variants,
    parent_product_id,version
  ) VALUES (
    p_parent_id,v_org,v_branch,btrim(p_name),nullif(btrim(p_sku),''),
    NULL,p_category_id,p_unit,0,0,0,p_minimum_stock,true,true,NULL,1
  )
  ON CONFLICT (id) DO NOTHING RETURNING id INTO v_inserted;

  SELECT * INTO v_parent FROM public.products
  WHERE id = p_parent_id AND org_id = v_org AND deleted_at IS NULL;
  IF NOT FOUND OR v_parent.has_variants IS DISTINCT FROM true
     OR v_parent.parent_product_id IS NOT NULL
     OR v_parent.name IS DISTINCT FROM btrim(p_name)
     OR v_parent.category_id IS DISTINCT FROM p_category_id
     OR v_parent.unit IS DISTINCT FROM p_unit
     OR v_parent.minimum_stock IS DISTINCT FROM p_minimum_stock
     OR v_parent.branch_id IS DISTINCT FROM v_branch
     OR v_parent.sku IS DISTINCT FROM nullif(btrim(p_sku),'') THEN
    RAISE EXCEPTION 'Parent ID collision or unauthorized parent' USING ERRCODE = '23505';
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_variants) LOOP
    IF jsonb_typeof(v_entry) <> 'object' THEN
      RAISE EXCEPTION 'Invalid variant row' USING ERRCODE = '22023';
    END IF;
    v_id := (v_entry->>'id')::uuid;
    v_brand := btrim(coalesce(v_entry->>'brand',''));
    v_fabric := btrim(coalesce(v_entry->>'fabric',''));
    v_color := btrim(coalesce(v_entry->>'color',''));
    v_size := btrim(coalesce(v_entry->>'size',''));
    v_sku := nullif(btrim(v_entry->>'sku'),'');
    v_barcode := nullif(btrim(v_entry->>'barcode'),'');
    v_cost := (v_entry->>'cost_price')::numeric;
    v_price := (v_entry->>'selling_price')::numeric;
    v_qty := (v_entry->>'stock_quantity')::numeric;
    IF v_id IS NULL OR v_id = p_parent_id OR v_id = ANY (v_seen_ids)
       OR v_sku IS NULL OR v_barcode IS NULL
       OR greatest(length(v_brand),length(v_fabric),length(v_color),length(v_size)) > 120
       OR (v_brand = '' AND v_fabric = '' AND v_color = '' AND v_size = '')
       OR v_cost IS NULL OR v_price IS NULL OR v_qty IS NULL
       OR v_cost < 0 OR v_price < 0 OR v_qty < 0 OR floor(v_qty) <> v_qty
       OR v_qty > 999999999 OR v_price > 999999999999 OR v_cost > 999999999999
       OR length(v_sku) > 120 OR length(v_barcode) > 120 THEN
      RAISE EXCEPTION 'Invalid unique boutique variant dimensions/quantity/price'
        USING ERRCODE = '22023';
    END IF;
    v_key := jsonb_build_array(lower(v_brand),lower(v_fabric),lower(v_color),lower(v_size))::text;
    IF v_key = ANY (v_seen_keys) THEN
      RAISE EXCEPTION 'Duplicate Brand/Fabric/Color/Size combination'
        USING ERRCODE = '23505';
    END IF;
    v_seen_ids := array_append(v_seen_ids,v_id);
    v_seen_keys := array_append(v_seen_keys,v_key);
    v_name := btrim(p_name) || ' — ' || concat_ws(' / ',
      nullif(v_brand,''),nullif(v_fabric,''),nullif(v_color,''),nullif(v_size,''));
    v_inserted := NULL;
    INSERT INTO public.products (
      id,org_id,branch_id,parent_product_id,has_variants,
      name,sku,barcode,category_id,unit,brand,fabric,color,size,
      cost_price,selling_price,stock_quantity,minimum_stock,is_active,version
    ) VALUES (
      v_id,v_org,v_branch,p_parent_id,false,
      v_name,v_sku,v_barcode,p_category_id,p_unit,
      nullif(v_brand,''),nullif(v_fabric,''),nullif(v_color,''),nullif(v_size,''),
      v_cost,v_price,v_qty,0,true,1
    )
    ON CONFLICT (id) DO NOTHING RETURNING id INTO v_inserted;

    SELECT * INTO v_child FROM public.products
    WHERE id = v_id AND org_id = v_org AND parent_product_id = p_parent_id
      AND deleted_at IS NULL;
    IF NOT FOUND OR v_child.version <> 1
       OR v_child.name IS DISTINCT FROM v_name
       OR v_child.sku IS DISTINCT FROM v_sku
       OR v_child.barcode IS DISTINCT FROM v_barcode
       OR v_child.brand IS DISTINCT FROM nullif(v_brand,'')
       OR v_child.fabric IS DISTINCT FROM nullif(v_fabric,'')
       OR v_child.color IS DISTINCT FROM nullif(v_color,'')
       OR v_child.size IS DISTINCT FROM nullif(v_size,'')
       OR v_child.cost_price IS DISTINCT FROM v_cost
       OR v_child.selling_price IS DISTINCT FROM v_price
       OR v_child.stock_quantity IS DISTINCT FROM v_qty THEN
      RAISE EXCEPTION 'Variant ID reused for different or inaccessible data'
        USING ERRCODE = '23505';
    END IF;
    IF v_inserted IS NOT NULL AND v_qty > 0 THEN
      INSERT INTO public.inventory_transactions (
        org_id,branch_id,product_id,movement_type,quantity,balance_after,
        reference_type,reference_id,notes,created_by
      ) VALUES (
        v_org,v_branch,v_id,'adjustment',v_qty,v_qty,
        'opening_stock',v_id,'Atomic boutique variant opening inventory',v_user
      );
    END IF;
    IF v_qty > 0 THEN
      SELECT count(*) INTO v_receipts FROM public.inventory_transactions AS movement
      WHERE movement.org_id = v_org AND movement.product_id = v_id
        AND movement.reference_type = 'opening_stock'
        AND movement.reference_id = v_id AND movement.quantity = v_qty
        AND movement.balance_after = v_qty;
      IF v_receipts <> 1 THEN
        RAISE EXCEPTION 'Variant opening stock cloud receipt missing/duplicate'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    v_expected := v_expected + v_qty;
  END LOOP;

  SELECT count(*),coalesce(sum(stock_quantity),0) INTO v_count,v_actual
  FROM public.products
  WHERE org_id = v_org AND parent_product_id = p_parent_id AND deleted_at IS NULL;
  SELECT * INTO v_parent FROM public.products
  WHERE id = p_parent_id AND org_id = v_org AND deleted_at IS NULL;
  IF v_count <> jsonb_array_length(p_variants)
     OR v_actual IS DISTINCT FROM v_expected
     OR v_parent.stock_quantity IS DISTINCT FROM v_actual THEN
    RAISE EXCEPTION 'Parent stock does not equal sum of its verified variants'
      USING ERRCODE = '23514';
  END IF;
  RETURN jsonb_build_object(
    'parent_id',p_parent_id,'org_id',v_org,'branch_id',v_branch,
    'variant_count',v_count,'stock_quantity',v_actual
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_boutique_variant_family(
  uuid,text,text,uuid,text,numeric,jsonb
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_boutique_variant_family(
  uuid,text,text,uuid,text,numeric,jsonb
) TO authenticated;
REVOKE ALL ON FUNCTION public.boutique_refresh_parent_stock(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.boutique_refresh_parent_stock(uuid) TO authenticated;
