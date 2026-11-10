import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261110_saas_storefront_shipping_quote.sql',import.meta.url),'utf8');
for(const s of [
 'ENABLE ROW LEVEL SECURITY','saas_shipping_tenant_read',
 'published=true','z.org_id=v_store.org_id',
 "p_postal_code !~ '^[0-9]{6}$'",
 'ORDER BY length(z.postal_prefix) DESC',
 "'cod_available',false",
 "'prepayment_verified',false",
 "'quote_only',true",
 'REVOKE ALL ON public.saas_storefront_shipping_zones',
 'GRANT EXECUTE ON FUNCTION public.saas_storefront_shipping_quote'
])assert.ok(sql.includes(s),s);
assert.ok(!/GRANT (INSERT|UPDATE|DELETE) ON public.saas_storefront_shipping_zones TO anon/i.test(sql));
console.log('M17 shipping quote static contract passed; live RLS/browser tests still required.');
