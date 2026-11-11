import type {TenantIndustryProfile,VerticalId} from "./tenant-industry";

export interface VerticalProductForm {
 industryId: VerticalId | "";
 batchNumber: string;
 expiryDate: string;
 drugFormulation: string;
 drugSchedule: string;
 serialImei: string;
 warrantyMonths: string;
 mrpPrice: string;
 recipeReference: string;
}
export interface VerticalProductPayload {
 industry_id: VerticalId;
 batch_number: string|null;
 expiry_date: string|null;
 drug_formulation: string|null;
 drug_schedule: string|null;
 serial_imei: string|null;
 warranty_months: number|null;
 mrp_price: number|null;
 recipe_reference: string|null;
}
export const EMPTY_VERTICAL_FORM: VerticalProductForm=Object.freeze({
 industryId:"",batchNumber:"",expiryDate:"",drugFormulation:"",
 drugSchedule:"",serialImei:"",warrantyMonths:"",mrpPrice:"",recipeReference:"",
});
function limited(value:string,label:string,max:number):string|null {
 const clean=value.trim();
 if(clean.length>max)throw new Error(label+" is too long.");
 return clean||null;
}
export function prepareVerticalProductPayload(
 profile:Readonly<TenantIndustryProfile>,
 form:Readonly<VerticalProductForm>,
 sellingPrice:number,
):Readonly<VerticalProductPayload> {
 if(!form.industryId||!profile.enabled_verticals.includes(form.industryId)){
  throw new Error("Choose an industry enabled for this business.");
 }
 if(!Number.isFinite(sellingPrice)||sellingPrice<0)throw new Error("Invalid selling price.");
 const batch=limited(form.batchNumber,"Batch number",120);
 const expiry=limited(form.expiryDate,"Expiry date",10);
 if(expiry&&(!/^\d{4}-\d{2}-\d{2}$/.test(expiry)||
     Number.isNaN(Date.parse(expiry+"T00:00:00Z"))||
     new Date(expiry+"T00:00:00Z").toISOString().slice(0,10)!==expiry)){
  throw new Error("Expiry date must be a real ISO calendar date.");
 }
 const pharma=form.industryId==="pharmacy_medical";
 const perishable=pharma||form.industryId==="fmcg_supermarket"||
  form.industryId==="bakery_cafe_restaurant";
 const electronics=form.industryId==="electronics_computer";
 const formulation=limited(form.drugFormulation,"Formulation",240);
 const schedule=limited(form.drugSchedule,"Drug schedule",120);
 const serial=limited(form.serialImei,"Serial / IMEI",120);
 const warrantyText=form.warrantyMonths.trim();
 const warranty=warrantyText===""?null:Number(warrantyText);
 const mrpText=form.mrpPrice.trim();
 const mrp=mrpText===""?null:Number(mrpText);
 if(perishable&&(!batch||!expiry))throw new Error("Batch number and expiry date are required.");
 if(pharma&&(!formulation||!schedule))throw new Error("Drug formulation and schedule are required.");
 if(electronics&&(!serial||serial.length<5||warranty===null)){
  throw new Error("Serial / IMEI (at least 5 characters) and warranty months are required.");
 }
 if(warranty!==null&&(!Number.isSafeInteger(warranty)||warranty<0||warranty>240)){
  throw new Error("Warranty months must be an integer from 0 to 240.");
 }
 if(mrp!==null&&(!/^(?:\d+(?:\.\d{1,3})?)$/.test(mrpText)||
  !Number.isFinite(mrp)||mrp<sellingPrice||mrp>999999999999)){
  throw new Error("MRP must be at least selling price and have at most three decimals.");
 }
 return Object.freeze({
  industry_id:form.industryId,batch_number:batch,expiry_date:expiry,
  drug_formulation:formulation,drug_schedule:schedule,serial_imei:serial,
  warranty_months:warranty,mrp_price:mrp,
  recipe_reference:limited(form.recipeReference,"Recipe reference",240),
 });
}
export function verticalFormFromRow(row:Record<string,unknown>):VerticalProductForm {
 return {
  industryId:typeof row.industry_id==="string"?row.industry_id as VerticalId:"",
  batchNumber:String(row.batch_number??""),
  expiryDate:String(row.expiry_date??""),
  drugFormulation:String(row.drug_formulation??""),
  drugSchedule:String(row.drug_schedule??""),
  serialImei:String(row.serial_imei??""),
  warrantyMonths:String(row.warranty_months??""),
  mrpPrice:String(row.mrp_price??""),
  recipeReference:String(row.recipe_reference??""),
 };
}
