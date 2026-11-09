-- M16/M17: tenant published catalog + anonymous cart to durable ERP draft order.
-- Never creates a payment capture or falsely decrements warehouse inventory.
-- Public API sees ONLY storefront listing snapshots opted in by tenant admin.
CREATE TABLE IF NOT EXISTS public.saas_storefronts(
 id uuid PRIMARY KEY,
 org_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id),
 slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,46}[a-z0-9]$'),
 title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
 published boolean NOT NULL DEFAULT false,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.saas_storefront_listings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 storefront_id uuid NOT NULL REFERENCES public.saas_storefronts(id),
 product_id uuid NOT NULL REFERENCES public.products(id),
 name text NOT NULL,
 sku text,
 price numeric(14,2) NOT NULL CHECK(price>=0),
 active boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (storefront_id,product_id)
);
CREATE TABLE IF NOT EXISTS public.saas_storefront_draft_orders(
 id uuid PRIMARY KEY,
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 storefront_id uuid NOT NULL REFERENCES public.saas_storefronts(id),
 buyer_name text NOT NULL,
 buyer_phone text NOT NULL,
 request_body jsonb NOT NULL,
 items jsonb NOT NULL,
 total numeric(14,2) NOT NULL CHECK (total>=0 AND total<=150000),
 status text NOT NULL DEFAULT 'pending_review'
  CHECK (status IN ('pending_review','accepted','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saas_store_orders_tenant ON public.saas_storefront_draft_orders(org_id,created_at DESC);
ALTER TABLE public.saas_storefronts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_storefront_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_storefront_draft_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_storefront_public_read ON public.saas_storefronts
 FOR SELECT TO anon,authenticated USING(
  published OR EXISTS(SELECT 1 FROM public.organization_members m
    WHERE m.org_id=saas_storefronts.org_id AND m.user_id=(SELECT auth.uid()))
 );
CREATE POLICY saas_store_listings_public_read ON public.saas_storefront_listings
 FOR SELECT TO anon,authenticated USING(
   (active AND EXISTS(SELECT 1 FROM public.saas_storefronts s
     WHERE s.id=saas_storefront_listings.storefront_id AND s.published))
   OR EXISTS(SELECT 1 FROM public.organization_members m
     WHERE m.org_id=saas_storefront_listings.org_id AND m.user_id=(SELECT auth.uid()))
 );
CREATE POLICY saas_store_orders_tenant_read ON public.saas_storefront_draft_orders
 FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.organization_members m
   WHERE m.org_id=saas_storefront_draft_orders.org_id AND m.user_id=(SELECT auth.uid())));
REVOKE ALL ON public.saas_storefronts,public.saas_storefront_listings,
 public.saas_storefront_draft_orders FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.saas_storefronts,public.saas_storefront_listings TO anon,authenticated;
GRANT SELECT ON public.saas_storefront_draft_orders TO authenticated;

CREATE OR REPLACE FUNCTION public.saas_publish_storefront(
 p_store_id uuid,p_slug text,p_title text,p_product_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_org uuid;v_user uuid := (SELECT auth.uid());
 v_existing public.saas_storefronts%ROWTYPE;v_count int;
BEGIN
 SELECT auth_org_id INTO v_org FROM public.current_user_authorization();
 IF v_user IS NULL OR v_org IS NULL OR NOT public.user_has_org_role(
  v_org,ARRAY['super_admin','admin','manager']) THEN
  RAISE EXCEPTION 'Storefront manager not authorized' USING ERRCODE='42501';
 END IF;
 IF p_store_id IS NULL OR p_slug !~ '^[a-z0-9][a-z0-9-]{2,46}[a-z0-9]$'
  OR length(btrim(p_title)) NOT BETWEEN 1 AND 120
  OR coalesce(array_length(p_product_ids,1),0) NOT BETWEEN 1 AND 1000
 THEN RAISE EXCEPTION 'Invalid public storefront payload' USING ERRCODE='22023';END IF;
 SELECT count(DISTINCT t.x) INTO v_count FROM unnest(p_product_ids) AS t(x);
 IF v_count<>array_length(p_product_ids,1) THEN
  RAISE EXCEPTION 'Repeated product in public store catalog' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_product_ids) AS t(id) WHERE NOT EXISTS(
    SELECT 1 FROM public.products p WHERE p.id=t.id AND p.org_id=v_org
      AND p.is_active IS TRUE AND p.deleted_at IS NULL
      AND coalesce(p.has_variants,false) IS FALSE
      AND p.selling_price>=0))
 THEN RAISE EXCEPTION 'Store product missing or outside tenant' USING ERRCODE='42501';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('store-publish:'||v_org::text,0));
 SELECT * INTO v_existing FROM public.saas_storefronts WHERE org_id=v_org FOR UPDATE;
 IF FOUND AND v_existing.id<>p_store_id THEN
  RAISE EXCEPTION 'Stable storefront ID cannot change' USING ERRCODE='23505';END IF;
 INSERT INTO public.saas_storefronts(id,org_id,slug,title,published,created_by)
 VALUES(p_store_id,v_org,p_slug,btrim(p_title),true,v_user)
 ON CONFLICT (id) DO UPDATE SET slug=excluded.slug,title=excluded.title,
  published=true,updated_at=now()
 WHERE saas_storefronts.org_id=v_org;
 UPDATE public.saas_storefront_listings SET active=false,updated_at=now()
 WHERE org_id=v_org AND storefront_id=p_store_id;
 INSERT INTO public.saas_storefront_listings(
  org_id,storefront_id,product_id,name,sku,price,active)
 SELECT v_org,p_store_id,p.id,p.name,p.sku,p.selling_price,true
 FROM public.products p WHERE p.org_id=v_org AND p.id=ANY(p_product_ids)
 ON CONFLICT (storefront_id,product_id) DO UPDATE SET
  name=excluded.name,sku=excluded.sku,price=excluded.price,active=true,updated_at=now()
 WHERE saas_storefront_listings.org_id=v_org;
 RETURN jsonb_build_object('storefront_id',p_store_id,'slug',p_slug,
  'published',true,'items',v_count);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.saas_storefront_place_order(
 p_order_id uuid,p_slug text,p_buyer_name text,p_buyer_phone text,p_items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_store public.saas_storefronts%ROWTYPE;
 v_existing public.saas_storefront_draft_orders%ROWTYPE;
 v_request jsonb;v_item jsonb;v_listing public.saas_storefront_listings%ROWTYPE;
 v_product public.products%ROWTYPE;
 v_total numeric(14,2):=0;v_cart jsonb:='[]'::jsonb;
 v_qty integer;v_count int;
BEGIN
 IF p_order_id IS NULL OR p_slug IS NULL OR
   length(btrim(p_buyer_name)) NOT BETWEEN 1 AND 120 OR
   p_buyer_phone !~ '^\+?[0-9]{10,15}$' OR
   jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR
   jsonb_array_length(p_items) NOT BETWEEN 1 AND 30 THEN
  RAISE EXCEPTION 'Invalid store checkout request' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_store FROM public.saas_storefronts
 WHERE slug=p_slug AND published IS TRUE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Storefront unavailable' USING ERRCODE='42501';END IF;
 SELECT count(DISTINCT value->>'product_id') INTO v_count
 FROM jsonb_array_elements(p_items);
 IF v_count<>jsonb_array_length(p_items) THEN
  RAISE EXCEPTION 'Duplicate item in cart' USING ERRCODE='22023';END IF;
 v_request:=jsonb_build_object('slug',p_slug,'buyer_name',btrim(p_buyer_name),
  'buyer_phone',p_buyer_phone,'items',p_items);
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('store-cart:'||v_store.org_id::text||':'||p_order_id::text,0));
 SELECT * INTO v_existing FROM public.saas_storefront_draft_orders
 WHERE id=p_order_id;
 IF FOUND THEN
  IF v_existing.org_id<>v_store.org_id OR v_existing.request_body IS DISTINCT FROM v_request THEN
    RAISE EXCEPTION 'Store order ID reused for different buyer/cart' USING ERRCODE='23505';
  END IF;
  RETURN jsonb_build_object('order_id',p_order_id,'total',v_existing.total,
   'status',v_existing.status,'idempotent',true);
 END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF nullif(v_item->>'product_id','') IS NULL OR nullif(v_item->>'quantity','') IS NULL THEN
   RAISE EXCEPTION 'Malformed store cart item' USING ERRCODE='22023';END IF;
  v_qty:=(v_item->>'quantity')::integer;
  IF v_qty NOT BETWEEN 1 AND 20 THEN
   RAISE EXCEPTION 'Invalid store cart quantity' USING ERRCODE='22023';END IF;
  SELECT * INTO v_listing FROM public.saas_storefront_listings
  WHERE storefront_id=v_store.id AND org_id=v_store.org_id
   AND product_id=(v_item->>'product_id')::uuid AND active IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cart item is not publicly listed'
   USING ERRCODE='42501';END IF;
  SELECT * INTO v_product FROM public.products p WHERE p.id=v_listing.product_id
   AND p.org_id=v_store.org_id AND p.is_active IS TRUE
   AND p.deleted_at IS NULL AND coalesce(p.has_variants,false) IS FALSE;
  IF NOT FOUND OR v_product.selling_price IS DISTINCT FROM v_listing.price
   OR v_product.stock_quantity<v_qty THEN
   RAISE EXCEPTION 'Cart item stock or Price changed; refresh store' USING ERRCODE='40001';END IF;
  v_total:=v_total+round(v_listing.price*v_qty,2);
  IF v_total>150000 THEN RAISE EXCEPTION 'Cart amount exceeds guest limit'
    USING ERRCODE='22023';END IF;
  v_cart:=v_cart||jsonb_build_array(jsonb_build_object(
    'product_id',v_listing.product_id,'name',v_listing.name,
    'quantity',v_qty,'unit_price',v_listing.price,
    'line_total',round(v_listing.price*v_qty,2)));
 END LOOP;
 INSERT INTO public.saas_storefront_draft_orders(
  id,org_id,storefront_id,buyer_name,buyer_phone,request_body,items,total)
 VALUES(p_order_id,v_store.org_id,v_store.id,btrim(p_buyer_name),
  p_buyer_phone,v_request,v_cart,v_total);
 RETURN jsonb_build_object('order_id',p_order_id,'total',v_total,
  'status','pending_review','idempotent',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.saas_publish_storefront(uuid,text,text,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.saas_publish_storefront(uuid,text,text,uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.saas_storefront_place_order(uuid,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.saas_storefront_place_order(uuid,text,text,text,jsonb) TO anon,authenticated;
