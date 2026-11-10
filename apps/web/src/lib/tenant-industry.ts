/**
 * P0 online-only tenant industry presentation contract.
 * UI visibility and editing hints are NEVER authorization, product availability,
 * tax compliance, or an entitlement. Server RLS/RBAC and plan checks still apply.
 */
export const VERTICALS = [
 {id:"fmcg_supermarket",label:"FMCG / Supermarket",fields:["Barcode","MRP","Batch number","Expiry date","Bulk tier pricing"],pos:"Fast barcode POS · batch/expiry review",nav:["warehouse"]},
 {id:"pharmacy_medical",label:"Pharmacy / Medical Store",fields:["Drug formulation","Batch number","Expiry date","Drug schedule","Prescriber reference"],pos:"Pharmacy POS · check medicine regulations",nav:["warehouse"]},
 {id:"electronics_computer",label:"Computer / Electronics & Repair",fields:["Serial / IMEI","Warranty period","Service job reference","AMC reference"],pos:"Serial and warranty verification",nav:["services","warehouse"]},
 {id:"bakery_cafe_restaurant",label:"Bakery / Cafe / Restaurant",fields:["Recipe ingredients","Preparation batch","Best before","Table / KOT number"],pos:"Cafe POS · table/KOT workflows require acceptance",nav:["warehouse"]},
 {id:"boutique_apparel",label:"Boutique / Apparel",fields:["Size","Color","Fabric","Variant barcode","38x25 mm 2-up label"],pos:"Apparel POS · size/color variant selection",nav:["services","warehouse"]},
 {id:"laundry_tailoring",label:"Laundry / Tailoring",fields:["Garment tag","Service stage","Measurements","Promised delivery"],pos:"Laundry/tailoring service billing",nav:["laundry","services"]},
 {id:"general_trading_b2b",label:"General Trading / B2B",fields:["Warehouse bin","Credit limit","Proforma reference","Delivery challan"],pos:"B2B quotation and credit workflow",nav:["warehouse"]},
] as const;

export const OPTIONAL_MODULES = [
 {id:"crm",label:"CRM",href:"/customer-crm"},
 {id:"online_store",label:"Online Store",href:"/storefront"},
 {id:"marketing",label:"Marketing / Leads",href:"/notifications"},
 {id:"loyalty",label:"Customer Loyalty (staged)",href:"/customers"},
 {id:"field_service",label:"Field Service",href:"/field-service"},
] as const;
export const CURRENCIES = ["INR","OMR","AED","SAR","USD","EUR"] as const;
export const LANGUAGES = ["en","ar"] as const;
export const VERTICAL_IDS = VERTICALS.map(v=>v.id);
export type VerticalId = typeof VERTICALS[number]["id"];
export type PrimaryIndustry = VerticalId | "multi_vertical";
export type OptionalModule = typeof OPTIONAL_MODULES[number]["id"];
export type ProfileCurrency = typeof CURRENCIES[number];
export type ProfileLanguage = typeof LANGUAGES[number];

export interface TenantIndustryProfile {
 readonly org_id: string;
 readonly primary_vertical: PrimaryIndustry | null;
 readonly enabled_verticals: readonly VerticalId[];
 readonly enabled_modules: readonly OptionalModule[];
 readonly country_code: string;
 readonly currency_code: ProfileCurrency;
 readonly language_code: ProfileLanguage;
 readonly updated_at: string;
}
export function isVertical(value: unknown): value is VerticalId {
 return typeof value==="string" && VERTICAL_IDS.some(v=>v===value);
}
export function isPrimary(value: unknown): value is PrimaryIndustry {
 return value==="multi_vertical"||isVertical(value);
}
export function isModule(value: unknown): value is OptionalModule {
 return OPTIONAL_MODULES.some(v=>v.id===value);
}
export function parseTenantIndustryProfile(raw: unknown): TenantIndustryProfile {
 if(!raw||typeof raw!=="object") throw new TypeError("Tenant profile unavailable");
 const p=raw as Record<string,unknown>;
 if(typeof p.org_id!=="string"||!/^[0-9a-f-]{36}$/i.test(p.org_id))throw new TypeError("Invalid tenant ID");
 const primary=p.primary_vertical;
 if(primary!==null&&!isPrimary(primary))throw new TypeError("Invalid primary industry");
 if(!Array.isArray(p.enabled_verticals)||!p.enabled_verticals.every(isVertical))throw new TypeError("Invalid industry list");
 if(!Array.isArray(p.enabled_modules)||!p.enabled_modules.every(isModule))throw new TypeError("Invalid module list");
 if(typeof p.country_code!=="string"||!/^[A-Z]{2}$/.test(p.country_code))throw new TypeError("Invalid country");
 if(!CURRENCIES.some(c=>c===p.currency_code)||!LANGUAGES.some(l=>l===p.language_code))
  throw new TypeError("Invalid localization");
 if(typeof p.updated_at!=="string"||!Number.isFinite(Date.parse(p.updated_at)))throw new TypeError("Invalid profile revision");
 const enabled=[...new Set(p.enabled_verticals)] as VerticalId[];
 const modules=[...new Set(p.enabled_modules)] as OptionalModule[];
 if(primary&&primary!=="multi_vertical"&&!enabled.includes(primary))throw new TypeError("Primary industry must be selected");
 return Object.freeze({
  org_id:p.org_id,primary_vertical:primary as PrimaryIndustry|null,
  enabled_verticals:Object.freeze(enabled),enabled_modules:Object.freeze(modules),
  country_code:p.country_code,currency_code:p.currency_code as ProfileCurrency,
  language_code:p.language_code as ProfileLanguage,updated_at:p.updated_at,
 });
}
export function selectedIndustries(profile:TenantIndustryProfile|null): typeof VERTICALS[number][] {
 if(!profile)return [];
 return VERTICALS.filter(v=>profile.enabled_verticals.includes(v.id));
}
export function industryProductFields(profile:TenantIndustryProfile|null): string[] {
 return [...new Set(selectedIndustries(profile).flatMap(v=>[...v.fields]))];
}
export function industryPosHints(profile:TenantIndustryProfile|null): string[] {
 return selectedIndustries(profile).map(v=>v.pos);
}
export function visibleIndustryNavIds(profile:TenantIndustryProfile|null): ReadonlySet<string> {
 // Neutral fallback = universal ERP, not boutique. Nav customization does not grant access.
 const hide=new Set<string>(["laundry","services"]);
 if(!profile)return hide;
 const ids=new Set(selectedIndustries(profile).flatMap(v=>[...v.nav]));
 for(const id of ids)hide.delete(id);
 // Only existing enabled/visible services are shown; subscription/RBAC still gate writes.
 if(profile.enabled_modules.includes("field_service"))hide.delete("services");
 return hide;
}
export function visibleIndustryActions(profile:TenantIndustryProfile|null): ReadonlySet<string> {
 const selected=selectedIndustries(profile);
 const enabled=new Set(["sale","expense","purchase","customer","reports","sms"]);
 if(selected.some(v=>v.nav.some(id=>id==="services")))enabled.add("order");
 if(selected.some(v=>v.nav.some(id=>id==="laundry")))enabled.add("laundry");
 return enabled;
}
