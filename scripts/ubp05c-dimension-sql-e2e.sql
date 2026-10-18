\set ON_ERROR_STOP on
-- UBP-05c: isolated PG17 test only. The whole fixture is rolled back.
BEGIN;

CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quantity numeric(14,3) NOT NULL
);
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

-- Deliberately fail RED when the implementation migration does not exist.
\i supabase/migrations/20261018_ubp05c_dimensional_sale_line_storage.sql

DO $assert$
DECLARE
  v_legacy uuid := gen_random_uuid();
  v_area uuid := gen_random_uuid();
  v_metadata jsonb := '{
    "schema":"dimension-line-v1","algorithm":"area-v1",
    "length":"12","width":"18","lengthUnit":"in","widthUnit":"in",
    "billableUnit":"sqft","pieces":2,"quantityMilli":3000
  }'::jsonb;
  v_invalid jsonb;
  v_key text;
  v_value jsonb;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.sale_items'::regclass) THEN
    RAISE EXCEPTION 'Migration changed sale_items RLS';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='sale_items'
  ) THEN
    RAISE EXCEPTION 'Migration added sale_items authorization policy unexpectedly';
  END IF;

  -- Existing checkout rows must continue to insert without metadata.
  INSERT INTO public.sale_items(id,quantity) VALUES (v_legacy,1);
  IF (SELECT dimension_metadata FROM public.sale_items WHERE id=v_legacy) IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy rows cannot acquire synthetic metadata';
  END IF;

  INSERT INTO public.sale_items(id,quantity,dimension_metadata)
    VALUES (v_area,3,v_metadata);
  IF (SELECT dimension_metadata FROM public.sale_items WHERE id=v_area) <> v_metadata THEN
    RAISE EXCEPTION 'Exact JSON measurement did not survive persistence';
  END IF;

  BEGIN
    UPDATE public.sale_items SET quantity=4 WHERE id=v_area;
    RAISE EXCEPTION 'Invalid quantity update passed the SQL check';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- An audited measurement must be write-once. Even a mathematically valid
  -- replacement or late backfill would rewrite invoice history.
  BEGIN
    UPDATE public.sale_items SET dimension_metadata=NULL WHERE id=v_area;
    RAISE EXCEPTION 'Allowed deletion of committed dimension metadata';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    UPDATE public.sale_items
      SET quantity=6,
          dimension_metadata=jsonb_set(v_metadata,'{length}','"24"'::jsonb)
      WHERE id=v_area;
    RAISE EXCEPTION 'Allowed replacement with another valid dimension';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    UPDATE public.sale_items SET dimension_metadata=v_metadata WHERE id=v_legacy;
    RAISE EXCEPTION 'Allowed adding measurement after legacy sale completion';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- An unchanged measurement can survive unrelated idempotent updates.
  UPDATE public.sale_items SET dimension_metadata=v_metadata WHERE id=v_area;

  -- Pure verifier rejects tampering and unknown input; existing JSONB
  -- column is NOT trusted as stock/payment/tenant permission.
  IF NOT public.ubp_dimension_line_valid(v_metadata,3) THEN
    RAISE EXCEPTION 'Valid square foot record rejected';
  END IF;
  IF NOT public.ubp_dimension_line_valid('{
    "schema":"dimension-line-v1","algorithm":"area-v1",
    "length":"1","width":"100","lengthUnit":"m","widthUnit":"cm",
    "billableUnit":"sqm","pieces":3,"quantityMilli":3000
  }'::jsonb,3) THEN
    RAISE EXCEPTION 'Mixed metres and centimetres rejected';
  END IF;
  IF NOT public.ubp_dimension_line_valid('{
    "schema":"dimension-line-v1","algorithm":"area-v1",
    "length":"0.0015","width":"1","lengthUnit":"m","widthUnit":"m",
    "billableUnit":"sqm","pieces":1,"quantityMilli":2
  }'::jsonb,0.002) THEN
    RAISE EXCEPTION 'Half-up 0.0015 sqm did not round to 0.002';
  END IF;
  FOR v_key,v_value IN
    SELECT * FROM (VALUES
      ('length','"13"'::jsonb),
      ('width','"19"'::jsonb),
      ('lengthUnit','"yd"'::jsonb),
      ('billableUnit','"acre"'::jsonb),
      ('pieces','3'::jsonb),
      ('quantityMilli','3001'::jsonb),
      ('schema','"v2"'::jsonb),
      ('schema','null'::jsonb),
      ('algorithm','"area-v2"'::jsonb),
      ('algorithm','null'::jsonb),
      ('length','"1e3"'::jsonb),
      ('length','"0"'::jsonb)
    ) AS cases(key,value)
  LOOP
    v_invalid := jsonb_set(v_metadata,ARRAY[v_key],v_value);
    IF public.ubp_dimension_line_valid(v_invalid,3) THEN
      RAISE EXCEPTION 'Accepted forged dimensional %: %',v_key,v_value;
    END IF;
    BEGIN
      INSERT INTO public.sale_items(quantity,dimension_metadata)
        VALUES (3,v_invalid);
      RAISE EXCEPTION 'CHECK allowed forged dimension %',v_key;
    EXCEPTION WHEN check_violation THEN NULL; END;
  END LOOP;

  IF public.ubp_dimension_line_valid(v_metadata || '{"extra":1}'::jsonb,3)
     OR public.ubp_dimension_line_valid(v_metadata - 'pieces',3)
     OR public.ubp_dimension_line_valid('[]'::jsonb,3)
     OR public.ubp_dimension_line_valid('{}'::jsonb,3)
     OR public.ubp_dimension_line_valid(v_metadata,2.999)
     OR public.ubp_dimension_line_valid(v_metadata || '{"pieces":1.5}'::jsonb,3)
     OR public.ubp_dimension_line_valid(v_metadata || '{"quantityMilli":0}'::jsonb,3)
     OR public.ubp_dimension_line_valid(v_metadata || '{"quantityMilli":999999999999999}'::jsonb,3)
  THEN
    RAISE EXCEPTION 'Invalid JSON, quantity or shape accepted';
  END IF;

  IF (SELECT prosecdef FROM pg_proc WHERE oid =
    'public.ubp_dimension_line_valid(jsonb,numeric)'::regprocedure) THEN
    RAISE EXCEPTION 'Validator must not be SECURITY DEFINER';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename IN ('sales','products','payments')
      AND policyname LIKE '%ubp_dimension%'
  ) THEN
    RAISE EXCEPTION 'Unrelated financial authorization was modified';
  END IF;
END;
$assert$;

ROLLBACK;
