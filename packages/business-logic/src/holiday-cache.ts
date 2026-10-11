import { assertPermission } from "./permissions";
import { validateHolidayRule, type HolidayRule } from "./holiday-calendar";

/**
 * HR-005 Windows/Offline read-only holiday rule cache.
 * This is ONLY backup/restore parity for already authorized holiday snapshots.
 * It is not authority to create or update Cloud rules, resolve two devices'
 * revisions, grant holiday pay or mutate attendance/rosters.
 */
const cache:HolidayRule[]=[];
const uuid=(v:unknown):v is string=>typeof v==="string" &&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export function validateHolidayCache(source:unknown):HolidayRule[] {
 if(!Array.isArray(source)||source.length>5000)
   throw Error("Offline holiday cache needs a bounded complete array");
 const copy:HolidayRule[]=[];
 const ids=new Set<string>();
 let orgId:string|null=null;
 for(const raw of source) {
   if(!raw||typeof raw!=="object"||Array.isArray(raw))
     throw Error("Invalid offline holiday snapshot record");
   const row=raw as HolidayRule;
   validateHolidayRule(row);
   if(!uuid(row.id)||!uuid(row.orgId)||
      (row.branchId!==null&&!uuid(row.branchId)))
     throw Error("Invalid holiday/tenant UUID in offline snapshot");
   if(ids.has(row.id)) throw Error("Duplicate holiday identity in offline snapshot");
   ids.add(row.id);
   if(orgId!==null&&row.orgId!==orgId)
     throw Error("Cross-organization holiday backup refused");
   orgId=row.orgId;
   // Copy fields individually; never trust an incoming object prototype or
   // retain mutable caller references inside a live Windows cache.
   copy.push({id:row.id,orgId:row.orgId,scope:row.scope,
     countryCode:row.countryCode,branchId:row.branchId,date:row.date,
     repeatsAnnually:row.repeatsAnnually,name:row.name,
     treatment:row.treatment,active:row.active,version:row.version});
 }
 return copy.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
export function hydrateHolidayCache(snapshot:unknown):void {
 const checked=validateHolidayCache(snapshot);
 cache.splice(0,cache.length,...checked);
}
export function exportHolidayCache():HolidayRule[]{
 return cache.map(rule=>({...rule}));
}
export function listHolidayCache():HolidayRule[]{
 assertPermission("staff.manage");
 return exportHolidayCache();
}
