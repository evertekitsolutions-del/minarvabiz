/** Financial sync envelope contract (A-SYNC-V2). Durable idempotency must be enforced by the receiving database transaction. */
export const FINANCIAL_SYNC_SCHEMA_VERSION = 1 as const;
export const FINANCIAL_SYNC_EVENT_TYPES = ["sale.posted","payment.recorded","refund.posted","purchase.received","stock.adjusted","journal.posted"] as const;
export type FinancialSyncEventType = (typeof FINANCIAL_SYNC_EVENT_TYPES)[number];
export interface FinancialSyncEnvelope {
 readonly schemaVersion: typeof FINANCIAL_SYNC_SCHEMA_VERSION; readonly eventId:string; readonly idempotencyKey:string;
 readonly tenantId:string; readonly companyId:string; readonly branchId:string; readonly deviceId:string;
 readonly aggregateType:string; readonly aggregateId:string; readonly eventType:FinancialSyncEventType;
 readonly currency:string; readonly occurredAt:string; readonly payload:Readonly<Record<string,unknown>>;
}
export type FinancialEnvelopeValidation =
 | {readonly ok:true;readonly envelope:FinancialSyncEnvelope}
 | {readonly ok:false;readonly errors:readonly string[]};
export type FinancialEnvelopeAcceptance =
 | {readonly status:"accepted";readonly envelope:FinancialSyncEnvelope}
 | {readonly status:"duplicate";readonly originalEventId:string}
 | {readonly status:"idempotency-conflict";readonly originalEventId:string;readonly error:string}
 | {readonly status:"invalid";readonly errors:readonly string[]};
const isRecord=(v:unknown):v is Record<string,unknown>=>typeof v==="object"&&v!==null&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const nonEmpty=(v:unknown):v is string=>typeof v==="string"&&v.trim().length>0&&v.length<=200;
function canonicalUtc(v:unknown):v is string { if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v))return false;const d=new Date(v);return Number.isFinite(d.getTime())&&d.toISOString()===v; }
function jsonSafe(v:unknown,seen=new Set<object>()):boolean { if(v===null||typeof v==="string"||typeof v==="boolean")return true;if(typeof v==="number")return Number.isFinite(v);if(typeof v!=="object"||seen.has(v))return false;seen.add(v);let ok:boolean;if(Array.isArray(v))ok=v.every(x=>jsonSafe(x,seen));else if(isRecord(v))ok=Object.keys(v).every(k=>jsonSafe(v[k],seen));else ok=false;seen.delete(v);return ok; }
function canonicalJson(v:unknown):string { if(Array.isArray(v))return "["+v.map(canonicalJson).join(",")+"]";if(isRecord(v))return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonicalJson(v[k])).join(",")+"}";return JSON.stringify(v) ?? "null"; }
function fingerprint(e:FinancialSyncEnvelope):string{return canonicalJson({tenantId:e.tenantId,companyId:e.companyId,branchId:e.branchId,deviceId:e.deviceId,aggregateType:e.aggregateType,aggregateId:e.aggregateId,eventType:e.eventType,currency:e.currency,payload:e.payload});}
export function validateFinancialSyncEnvelope(value:unknown):FinancialEnvelopeValidation {
 const errors:string[]=[];if(!isRecord(value))return{ok:false,errors:["Envelope must be a plain object"]};
 if(value.schemaVersion!==FINANCIAL_SYNC_SCHEMA_VERSION)errors.push("Unsupported schemaVersion");
 for(const f of ["eventId","idempotencyKey","tenantId","companyId","branchId","deviceId","aggregateType","aggregateId"] as const)if(!nonEmpty(value[f]))errors.push(f+" must be a non-empty string of at most 200 characters");
 if(!FINANCIAL_SYNC_EVENT_TYPES.includes(value.eventType as FinancialSyncEventType))errors.push("Unsupported financial eventType");
 if(typeof value.currency!=="string"||!/^[A-Z]{3}$/.test(value.currency))errors.push("currency must be a three-letter uppercase ISO-style code");
 if(!canonicalUtc(value.occurredAt))errors.push("occurredAt must be a canonical UTC timestamp with milliseconds");
 if(!isRecord(value.payload))errors.push("payload must be a plain object");else if(!jsonSafe(value.payload))errors.push("payload must contain only finite JSON-safe values without cycles");
 if(errors.length)return{ok:false,errors};
 return{ok:true,envelope:{schemaVersion:1,eventId:value.eventId as string,idempotencyKey:value.idempotencyKey as string,tenantId:value.tenantId as string,companyId:value.companyId as string,branchId:value.branchId as string,deviceId:value.deviceId as string,aggregateType:value.aggregateType as string,aggregateId:value.aggregateId as string,eventType:value.eventType as FinancialSyncEventType,currency:value.currency as string,occurredAt:value.occurredAt as string,payload:{...(value.payload as Record<string,unknown>)}}};
}
/** In-process detector for adapters/tests; production requires durable DB uniqueness + transaction. */
export class FinancialEnvelopeDeduplicator {
 private readonly seen=new Map<string,{eventId:string;fingerprint:string}>();
 accept(value:unknown):FinancialEnvelopeAcceptance {
  const result=validateFinancialSyncEnvelope(value);if(!result.ok)return{status:"invalid",errors:result.errors};
  const e=result.envelope,key=e.tenantId+"\u0000"+e.idempotencyKey,fp=fingerprint(e),prior=this.seen.get(key);
  if(prior){if(prior.fingerprint===fp)return{status:"duplicate",originalEventId:prior.eventId};return{status:"idempotency-conflict",originalEventId:prior.eventId,error:"Idempotency key was already used for a different financial command"};}
  this.seen.set(key,{eventId:e.eventId,fingerprint:fp});return{status:"accepted",envelope:e};
 }
 clear():void{this.seen.clear();}
 get size():number{return this.seen.size;}
}
