import assert from 'node:assert/strict';
import fs from 'node:fs';
const path='apps/web/src/lib/roster-policy-client.ts';
assert.ok(fs.existsSync(path),'Manager policy client is not implemented');
const {createRosterPolicyClient}=await import('../../../../'+path);
const org='10000000-0000-4000-8000-000000000001';
const branch='20000000-0000-4000-8000-000000000001';
let current=true,role='manager',calls=0,response;
const row={id:'30000000-0000-4000-8000-000000000001',org_id:org,branch_id:branch,effective_from:'2026-11-01',effective_until:null,iana_zone:'Asia/Kolkata',dst_gap_policy:'reject',dst_fold_policy:'reject',minimum_rest_minutes:660,status:'draft',version:1};
const client=createRosterPolicyClient({
 authorize:async()=>({orgId:org,role,ensureCurrent(){if(!current)throw Error('Session changed');}}),
 read:async()=>response,
 write:async args=>{calls++;assert.equal(args.p_expected_version,0);return response;},
});
const input={branchId:branch,effectiveFrom:'2026-11-01',effectiveUntil:null,ianaZone:'Asia/Kolkata',foldPolicy:'reject',minimumRestMinutes:660,expectedVersion:0};
response=[row];assert.deepEqual(await client.list(),[row]);
response={accepted:true,record:row};assert.equal((await client.save(input)).accepted,true);
response={accepted:false,remote:{...row,version:2}};assert.equal((await client.save(input)).accepted,false);
response={accepted:'true',record:row};await assert.rejects(client.save(input),/response/i);
response={accepted:true,record:{...row,org_id:branch}};await assert.rejects(client.save(input),/organization/i);
response={accepted:true,record:{...row,version:2}};await assert.rejects(client.save(input),/revision/i);
response={accepted:true,record:{...row,minimum_rest_minutes:0}};await assert.rejects(client.save(input),/match/i);
response=[{...row,status:'approved'}];await assert.rejects(client.list(),/draft/i);
response=[{...row,effective_from:'2026-02-30'}];await assert.rejects(client.list(),/date/i);
role='cashier';let before=calls;await assert.rejects(client.save(input),/manager/i);assert.equal(calls,before);
role='manager';current=false;await assert.rejects(client.save(input),/Session/);assert.equal(calls,before);
current=true;for(const patch of [{minimumRestMinutes:-1},{minimumRestMinutes:1.5},{expectedVersion:2147483647},{effectiveFrom:'2026-02-30'},{effectiveUntil:'2026-01-01'},{branchId:'x&org_id=eq.other'},{foldPolicy:'guess'}]){
 before=calls;await assert.rejects(client.save({...input,...patch}));assert.equal(calls,before);
}
const late=createRosterPolicyClient({authorize:async()=>({orgId:org,role:'manager',ensureCurrent(){if(!current)throw Error('Session changed');}}),read:async()=>{current=false;return [row]},write:async()=>{current=false;return {accepted:true,record:row}}});
current=true;await assert.rejects(late.list(),/Session/);current=true;await assert.rejects(late.save(input),/Session/);
console.log('Roster policy draft client: validation, conflicts, tenant and session checks PASS');
