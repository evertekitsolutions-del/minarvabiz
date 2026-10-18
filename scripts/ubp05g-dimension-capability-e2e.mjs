/** Local Supabase fixture only; never target the hosted customer database. */
import { execFileSync } from "node:child_process";
const find=(data,key)=>{
  if(!data || typeof data!=="object") return undefined;
  if(Object.hasOwn(data,key)) return data[key];
  for(const child of Object.values(data)){
    const result=find(child,key);
    if(result!==undefined) return result;
  }
};
const status=JSON.parse(execFileSync("supabase",["status","-o","json"],{encoding:"utf8"}));
const url=String(find(status,"DB_URL")||"");
if(!url) throw Error("Local Supabase database is unavailable");
if(!["127.0.0.1","localhost","[::1]"].includes(new URL(url).hostname)){
  throw Error("UBP-05g refuses non-loopback Supabase database");
}
const sql=String.raw`
BEGIN;
DO $fixture$
DECLARE
  v_user uuid := gen_random_uuid();
  v_response jsonb;
BEGIN
  IF to_regprocedure('public.ubp_dimension_sale_capability()') IS NULL THEN
    RAISE EXCEPTION 'Dimension capability RPC missing after migration replay';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.ubp_dimension_sale_capability()'::regprocedure
      AND NOT p.prosecdef
  ) THEN
    RAISE EXCEPTION 'Dimension capability must be SECURITY INVOKER';
  END IF;
  IF has_function_privilege('anon', 'public.ubp_dimension_sale_capability()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous dimension capability unexpectedly executable';
  END IF;
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, created_at, updated_at
  ) VALUES (
    v_user, '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated', 'authenticated', 'ubp05g-ci@example.invalid',
    '', now(), now()
  );
  PERFORM set_config('request.jwt.claim.sub',v_user::text,true);
  v_response := public.ubp_dimension_sale_capability();
  IF v_response IS DISTINCT FROM '{"protocol":"dimension-sale-v1","schemaVersion":1}'::jsonb THEN
    RAISE EXCEPTION 'Supported dimensional transaction capability not acknowledged';
  END IF;
  UPDATE public.organization_members SET role='tailor' WHERE user_id=v_user;
  BEGIN
    PERFORM public.ubp_dimension_sale_capability();
    RAISE EXCEPTION 'Non-sale role unexpectedly received capability';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claim.sub','',true);
  BEGIN
    PERFORM public.ubp_dimension_sale_capability();
    RAISE EXCEPTION 'Anonymous request unexpectedly received capability';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$fixture$;
ROLLBACK;
`;
const out=execFileSync("psql",[url,"-X","-v","ON_ERROR_STOP=1"],{
  input:sql,encoding:"utf8",stdio:["pipe","pipe","inherit"],
});
if(!/ROLLBACK/.test(out)) throw Error("UBP-05g fixture did not roll back");
console.log("UBP-05g local capability negotiation, role checks and ROLLBACK PASS");
