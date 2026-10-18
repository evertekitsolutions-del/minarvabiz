-- UBP-05c — nullable immutable dimensional sale-line audit packet.
-- Source migration ONLY. Keep existing sale/payment/stock authority and all RLS.
-- Existing rows remain NULL and legacy checkout inserts stay unchanged.
--
-- UBP-05a/05b use integer picometres and 0.001 quantity units; PostgreSQL
-- NUMERIC arithmetic implements the same exact factor and half-up rounding.

CREATE OR REPLACE FUNCTION public.ubp_dimension_line_valid(
  p_measurement jsonb,
  p_quantity numeric
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $ubp$
DECLARE
  v_keys integer;
  v_length_m numeric;
  v_width_m numeric;
  v_pieces numeric;
  v_quantity_milli numeric;
  v_unit_area_m2 numeric;
  v_expected_milli numeric;
BEGIN
  IF p_measurement IS NULL OR jsonb_typeof(p_measurement) <> 'object'
     OR p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN false;
  END IF;
  SELECT count(*) INTO v_keys FROM jsonb_object_keys(p_measurement);
  IF v_keys <> 9 OR NOT (
    p_measurement ?& ARRAY[
      'schema', 'algorithm', 'length', 'width', 'lengthUnit', 'widthUnit',
      'billableUnit', 'pieces', 'quantityMilli'
    ]::text[]
  ) THEN
    RETURN false;
  END IF;
  IF p_measurement->>'schema' <> 'dimension-line-v1'
     OR p_measurement->>'algorithm' <> 'area-v1'
     OR jsonb_typeof(p_measurement->'length') <> 'string'
     OR jsonb_typeof(p_measurement->'width') <> 'string'
     OR jsonb_typeof(p_measurement->'pieces') <> 'number'
     OR jsonb_typeof(p_measurement->'quantityMilli') <> 'number' THEN
    RETURN false;
  END IF;

  -- Same raw input precision bound as the existing TypeScript parser.
  IF (p_measurement->>'length') !~ '^[0-9]{1,9}(\.[0-9]{1,6})?$'
     OR (p_measurement->>'width') !~ '^[0-9]{1,9}(\.[0-9]{1,6})?$'
     OR (p_measurement->>'pieces') !~ '^[0-9]{1,7}$'
     OR (p_measurement->>'quantityMilli') !~ '^[0-9]{1,14}$' THEN
    RETURN false;
  END IF;

  v_pieces := (p_measurement->>'pieces')::numeric;
  v_quantity_milli := (p_measurement->>'quantityMilli')::numeric;
  IF v_pieces < 1 OR v_pieces > 1000000
     OR v_quantity_milli < 1 OR v_quantity_milli > 99999999999999
     OR p_quantity * 1000 <> v_quantity_milli THEN
    RETURN false;
  END IF;

  v_length_m := (p_measurement->>'length')::numeric * CASE p_measurement->>'lengthUnit'
    WHEN 'mm' THEN 0.001::numeric
    WHEN 'cm' THEN 0.01::numeric
    WHEN 'm' THEN 1::numeric
    WHEN 'in' THEN 0.0254::numeric
    WHEN 'ft' THEN 0.3048::numeric
    ELSE NULL::numeric END;
  v_width_m := (p_measurement->>'width')::numeric * CASE p_measurement->>'widthUnit'
    WHEN 'mm' THEN 0.001::numeric
    WHEN 'cm' THEN 0.01::numeric
    WHEN 'm' THEN 1::numeric
    WHEN 'in' THEN 0.0254::numeric
    WHEN 'ft' THEN 0.3048::numeric
    ELSE NULL::numeric END;
  v_unit_area_m2 := CASE p_measurement->>'billableUnit'
    WHEN 'sqm' THEN 1::numeric
    WHEN 'sqft' THEN 0.09290304::numeric
    ELSE NULL::numeric END;
  IF v_length_m IS NULL OR v_width_m IS NULL OR v_unit_area_m2 IS NULL
     OR v_length_m <= 0 OR v_width_m <= 0 THEN
    RETURN false;
  END IF;

  v_expected_milli := round(
    v_length_m * v_width_m * v_pieces * 1000 / v_unit_area_m2, 0
  );
  RETURN v_expected_milli BETWEEN 1 AND 99999999999999
     AND v_expected_milli = v_quantity_milli;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN false;
END;
$ubp$;

REVOKE ALL ON FUNCTION public.ubp_dimension_line_valid(jsonb,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ubp_dimension_line_valid(jsonb,numeric) TO authenticated;
DO $grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.ubp_dimension_line_valid(jsonb,numeric)
      TO service_role;
  END IF;
END;
$grant$;

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS dimension_metadata jsonb;

-- NOT VALID avoids scanning existing sales on an additive deploy. New inserts
-- and updates are checked immediately; schedule historical validation separately
-- after hosted rollout verification. RLS/checkout RPCs are untouched.
ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_dimension_metadata_valid
  CHECK (
    dimension_metadata IS NULL OR
    public.ubp_dimension_line_valid(dimension_metadata, quantity)
  ) NOT VALID;

COMMENT ON COLUMN public.sale_items.dimension_metadata IS
  'Optional validated dimension-line-v1 audit data. Not a price, tax, stock, authentication or replay authority.';
