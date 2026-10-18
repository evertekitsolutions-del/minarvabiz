/**
 * Checks the actually replayed UBP-05e SQL function in isolated Supabase.
 * Reads no customer data and always rolls back. No hosted DB URL accepted.
 */
import { execFileSync } from "node:child_process";

function findStatus(value,key){
  if (!value || typeof value !== "object") return undefined;
  if (Object.hasOwn(value,key)) return value[key];
  for (const nested of Object.values(value)){
    const result=findStatus(nested,key);
    if (result!==undefined) return result;
  }
}
const status=JSON.parse(execFileSync("supabase",["status","-o","json"],{encoding:"utf8"}));
const dbUrl=String(findStatus(status,"DB_URL")||"");
if(!dbUrl) throw Error("Isolated Supabase DB_URL unavailable");
const host=new URL(dbUrl).hostname;
if(!["127.0.0.1","localhost","[::1]"].includes(host)){
  throw Error("Refusing non-local Supabase URL: "+host);
}
const sql=String.raw\`
BEGIN;
DO $verify$
DECLARE
  v_source text;
  v_security_definer boolean;
  v_rls boolean;
BEGIN
  SELECT p.prosrc,p.prosecdef
  INTO v_source,v_security_definer
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.create_sale(jsonb,jsonb,boolean)');
  IF v_source IS NULL OR NOT v_security_definer THEN
    RAISE EXCEPTION 'UBP-05e authenticated atomic sale RPC is missing';
  END IF;
  IF position('v_dimension_metadata' IN v_source)=0 OR
     position('ubp_dimension_line_valid' IN v_source)=0 OR
     position('dimension_metadata' IN v_source)=0 OR
     position('Dimensional sale retry metadata conflict' IN v_source)=0 OR
     position('inventory_transactions' IN v_source)=0 OR
     position('public.payments' IN v_source)=0 THEN
    RAISE EXCEPTION 'UBP-05e RPC audit or financial boundary not installed';
  END IF;
  SELECT relrowsecurity INTO v_rls FROM pg_class
    WHERE oid='public.sale_items'::regclass;
  IF NOT v_rls THEN RAISE EXCEPTION 'sale_items RLS unexpectedly disabled'; END IF;
  IF NOT EXISTS (
     SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='sale_items'
       AND column_name='dimension_metadata' AND data_type='jsonb'
  ) THEN
    RAISE EXCEPTION 'sale_items dimension metadata column unavailable';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.sale_items'::regclass
      AND tgname='sale_items_dimension_metadata_write_once'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'write-once sale dimension trigger missing';
  END IF;
  IF public.ubp_dimension_line_valid('{
    "schema":"dimension-line-v1","algorithm":"area-v1",
    "length":"12","width":"18","lengthUnit":"in","widthUnit":"in",
    "billableUnit":"sqft","pieces":2,"quantityMilli":3000
  }'::jsonb,3) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Installed metadata validator rejects a valid dimensional sale';
  END IF;
  IF public.ubp_dimension_line_valid('{"schema":null}'::jsonb,3)
     IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'Installed validator allows malformed dimensions';
  END IF;
END;
$verify$;
ROLLBACK;
\`;
const out=execFileSync("psql",[dbUrl,"-X","-v","ON_ERROR_STOP=1"],{
  input:sql,encoding:"utf8",stdio:["pipe","pipe","inherit"],
});
if(!/ROLLBACK/.test(out)) throw Error("Isolated verification transaction was not rolled back");
console.log("UBP-05e fresh instance: schema, security, validator and atomic RPC source PASS");
