import {holidayCalendar} from "@minarvabiz/business-logic";
type HolidayRule=holidayCalendar.HolidayRule;
type Authority={orgId:string;role:string;ensureCurrent():void};
type Transport={
 authorize():Promise<Authority>;
 read(authority:Authority):Promise<unknown>;
 write(args:Record<string,unknown>,authority:Authority):Promise<unknown>;
};
export interface HolidayEdit {
 id:string;
 scope:HolidayRule["scope"];
 countryCode:string|null;
 branchId:string|null;
 date:string;
 repeatsAnnually:boolean;
 name:string;
 treatment:HolidayRule["treatment"];
 active:boolean;
 expectedVersion:number;
}
const uuid=(s:unknown):s is string=>typeof s==="string" &&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
function authorized(a:Authority) {
 if(!uuid(a.orgId)||!["super_admin","admin","manager"].includes(a.role))
   throw Error("Authorized holiday manager required");
 a.ensureCurrent();
}
export function validateHolidayEdit(input:HolidayEdit) {
 if(!uuid(input.id)||!Number.isSafeInteger(input.expectedVersion)||
    input.expectedVersion<0||input.expectedVersion>=2147483646)
   throw Error("Holiday identity or expected revision invalid");
 holidayCalendar.validateHolidayRule({
   ...input,orgId:"validation-only",version:Math.max(1,input.expectedVersion)
 });
 if(input.scope==="branch" && !uuid(input.branchId))
   throw Error("Holiday branch identity is invalid");
}
function parseRow(raw:unknown,orgId:string):HolidayRule {
 if(!raw||typeof raw!=="object")throw Error("Invalid holiday Cloud row");
 const row=raw as Record<string,unknown>;
 if(row.org_id!==orgId)throw Error("Holiday tenant mismatch");
 const rule:HolidayRule={
   id:row.id as string,orgId:row.org_id as string,
   scope:row.scope as HolidayRule["scope"],
   countryCode:row.country_code as string|null,
   branchId:row.branch_id as string|null,
   date:row.holiday_on as string,
   repeatsAnnually:row.repeats_annually as boolean,
   name:row.name as string,treatment:row.treatment as HolidayRule["treatment"],
   active:row.active as boolean,version:row.version as number
 };
 if(!uuid(rule.id)||!uuid(rule.orgId)||
     (rule.branchId!==null&&!uuid(rule.branchId)))
   throw Error("Invalid authorized holiday identity");
 holidayCalendar.validateHolidayRule(rule);
 return rule;
}
export function createHolidayManagerClient(transport:Transport){
 const requireManager=async()=>{
   const authority=await transport.authorize();
   authorized(authority);return authority;
 };
 return {
   async list():Promise<{orgId:string;rules:HolidayRule[]}> {
     const authority=await requireManager(),response=await transport.read(authority);
     authority.ensureCurrent();
     if(!Array.isArray(response)||response.length>5000)
       throw Error("Incomplete or unbounded authorized holiday list");
     const rows=response.map(item=>parseRow(item,authority.orgId));
     if(new Set(rows.map(row=>row.id)).size!==rows.length)
       throw Error("Duplicate Cloud holiday IDs; reload before editing");
     return {orgId:authority.orgId,rules:rows.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id))};
   },
   async save(input:HolidayEdit):Promise<{accepted:true;rule:HolidayRule}|{accepted:false;reason:string;remote:HolidayRule|null}>{
     validateHolidayEdit(input);
     const a=await requireManager();
     const result=await transport.write({
       p_id:input.id,p_scope:input.scope,p_country_code:input.countryCode,
       p_branch_id:input.branchId,p_date:input.date,
       p_repeats_annually:input.repeatsAnnually,p_name:input.name,
       p_treatment:input.treatment,p_active:input.active,
       p_expected_version:input.expectedVersion
     },a);
     a.ensureCurrent();
     if(!result||typeof result!=="object")throw Error("Holiday write outcome unknown; reload before retrying");
     const response=result as Record<string,unknown>;
     if(response.accepted!==true&&response.accepted!==false)throw Error("Malformed holiday RPC decision");
     if(response.accepted===false){
       const reason=String(response.reason??"conflict");
       if(!["stale_revision","not_found"].includes(reason))
         throw Error("Unexpected holiday write refusal; reload");
       const remote=response.remote==null?null:parseRow(response.remote,a.orgId);
       return {accepted:false,reason,remote};
     }
     if(response.attendance_payroll_enforcement_active!==false)
       throw Error("Holiday enforcement status unconfirmed");
     const rule=parseRow(response.record,a.orgId);
     if(rule.id!==input.id||rule.version!==input.expectedVersion+1||
       rule.scope!==input.scope||rule.countryCode!==input.countryCode||
       rule.branchId!==input.branchId||rule.date!==input.date||
       rule.repeatsAnnually!==input.repeatsAnnually||
       rule.name!==input.name||rule.treatment!==input.treatment||
       rule.active!==input.active)
       throw Error("Holiday response identity/version differs; reload before retrying");
     return {accepted:true,rule};
   }
 };
}
