/**
 * SVC-007 — offline service part usage evidence and original cost snapshot.
 * This is NOT a stock ledger entry, reserved quantity, tax invoice or COGS post.
 */
export type ServiceVisitPartStatus="used"|"voided";
export interface ServiceVisitPart {
  readonly id:string;
  readonly productId:string;
  readonly productName:string;
  readonly sku:string|null;
  readonly unit:string;
  /** Integer milli-units, same 3-decimal precision as stocked quantities. */
  readonly quantityMilli:number;
  readonly unitCostMinor:number;
  readonly totalCostMinor:number;
  readonly notes:string;
  readonly recordedAt:string;
  readonly status:ServiceVisitPartStatus;
  readonly voidedAt:string|null;
  readonly voidReason:string|null;
}
const MAX_PARTS=50;
export const SERVICE_VISIT_MAX_PARTS=MAX_PARTS;
function textValue(value:unknown,name:string,max:number,required:boolean):string {
  if(typeof value!=="string"||value.length>max||/[\u0000-\u001f\u007f]/.test(value)||
    (required&&!value.trim()))throw new Error("Invalid service part "+name);
  return value.trim();
}
function at(value:unknown):string {
  if(typeof value!=="string"||!/^20\d{2}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(value)||
     !Number.isFinite(Date.parse(value)))throw new Error("Invalid service part timestamp");
  return value;
}
function numeric(value:unknown,name:string,max:number):number {
  if(typeof value!=="number"||!Number.isSafeInteger(value)||value<0||value>max)
    throw new Error("Invalid service part "+name);
  return value;
}
export function costPartMinor(quantityMilli:number,unitCostMinor:number):number{
  numeric(quantityMilli,"quantity",1_000_000_000);
  numeric(unitCostMinor,"unit cost",100_000_000_000);
  if(quantityMilli===0)throw new Error("Service part quantity must be positive");
  const cost=Math.round(quantityMilli*unitCostMinor/1000);
  if(!Number.isSafeInteger(cost)||cost>100_000_000_000)
    throw new Error("Service part cost exceeds supported range");
  return cost;
}
export function parseServicePartQuantity(raw:string):number {
  if(typeof raw!=="string"||!/^[0-9]+(?:\.[0-9]{1,3})?$/.test(raw.trim()))
    throw new Error("Service part quantity needs 1–3 decimal places");
  const quantityMilli=Math.round(Number(raw.trim())*1000);
  numeric(quantityMilli,"quantity",1_000_000_000);
  if(!quantityMilli)throw new Error("Service part quantity must be positive");
  return quantityMilli;
}
export function validateServiceVisitPart(raw:unknown,arrivedAt:string|null,
    updatedAt:string,status:string):ServiceVisitPart{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("Invalid service part record");
  const o=raw as Record<string,unknown>;
  const fields=["id","productId","productName","sku","unit","quantityMilli",
    "unitCostMinor","totalCostMinor","notes","recordedAt","status","voidedAt","voidReason"];
  if(Object.keys(o).some(k=>!fields.includes(k)))throw new Error("Unknown service part field");
  const id=textValue(o.id,"id",128,true),productId=textValue(o.productId,"product ID",128,true);
  const productName=textValue(o.productName,"name",200,true);
  const sku=o.sku===null?null:textValue(o.sku,"SKU",120,false);
  const unit=textValue(o.unit,"unit",32,true),notes=textValue(o.notes,"notes",500,false);
  const quantityMilli=numeric(o.quantityMilli,"quantity",1_000_000_000);
  const unitCostMinor=numeric(o.unitCostMinor,"unit cost",100_000_000_000);
  if(!quantityMilli)throw new Error("Service part quantity must be positive");
  const totalCostMinor=numeric(o.totalCostMinor,"total cost",100_000_000_000);
  if(costPartMinor(quantityMilli,unitCostMinor)!==totalCostMinor)
    throw new Error("Service part cost snapshot does not reconcile");
  const recordedAt=at(o.recordedAt);
  if(!arrivedAt||!["arrived","completed"].includes(status)||
    recordedAt<arrivedAt||recordedAt>updatedAt)
    throw new Error("Service part usage requires site arrival");
  if(o.status!=="used"&&o.status!=="voided")throw new Error("Invalid service part status");
  const voidedAt=o.voidedAt===null?null:at(o.voidedAt);
  const voidReason=o.voidReason===null?null:textValue(o.voidReason,"void reason",500,true);
  if(o.status==="used"&&(voidedAt!==null||voidReason!==null)||
    o.status==="voided"&&(voidedAt===null||voidReason===null||
      voidReason.length<3||voidedAt<recordedAt||voidedAt>updatedAt))
    throw new Error("Invalid service part correction timeline");
  return {id,productId,productName,sku,unit,quantityMilli,unitCostMinor,
    totalCostMinor,notes,recordedAt,status:o.status,voidedAt,voidReason};
}
export function validateServiceVisitParts(raw:unknown,arrivedAt:string|null,
  updatedAt:string,status:string):ServiceVisitPart[]{
  if(!Array.isArray(raw)||raw.length>MAX_PARTS)
    throw new Error("Invalid service part collection");
  const ids=new Set<string>();
  return raw.map(x=>{
    const p=validateServiceVisitPart(x,arrivedAt,updatedAt,status);
    if(ids.has(p.id))throw new Error("Duplicate service part identity");
    ids.add(p.id);return p;
  });
}
export interface ServicePartSummary {
  readonly usedCount:number;readonly voidedCount:number;readonly totalCostMinor:number;
}
export function summarizeServiceVisitParts(parts:readonly ServiceVisitPart[]):ServicePartSummary{
  let total=0,used=0,voided=0;
  for(const p of parts){
    if(p.status==="voided"){voided++;continue;}
    used++;
    total+=p.totalCostMinor;
    if(!Number.isSafeInteger(total)||total>100_000_000_000)
      throw new Error("Service part summary exceeds safe cost range");
  }
  return {usedCount:used,voidedCount:voided,totalCostMinor:total};
}
