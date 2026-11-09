-- M14: disallow forging laundering jobs, prices, or stage with the Data API.
-- SECURITY DEFINER functions below have explicit auth.uid(), scoped org, role
-- and immutable job checks. They are the only supported write entrypoints.
REVOKE INSERT,UPDATE ON public.saas_laundry_garment_jobs FROM authenticated;
DROP POLICY IF EXISTS saas_laundry_jobs_insert ON public.saas_laundry_garment_jobs;
DROP POLICY IF EXISTS saas_laundry_jobs_update ON public.saas_laundry_garment_jobs;
ALTER FUNCTION public.saas_laundry_intake(uuid,uuid,text,text,text,integer,text)
 SECURITY DEFINER;
ALTER FUNCTION public.saas_laundry_step(uuid,integer,text)
 SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.saas_laundry_intake(uuid,uuid,text,text,text,integer,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.saas_laundry_step(uuid,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.saas_laundry_intake(uuid,uuid,text,text,text,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.saas_laundry_step(uuid,integer,text) TO authenticated;
