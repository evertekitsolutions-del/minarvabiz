/**
 * HR-004C draft-only, tenant-bound policy transport.
 * Server-side current_user_authorization(), RLS and audited RPC are final authority.
 * The browser does not store policy credentials or execute table DML.
 */
import { configFromEnv, pgSelectAll, pgRpc } from "@minarvabiz/database";
import {
  can, getRemoteWriterGeneration, getSessionToken, getSessionUser,
} from "@minarvabiz/business-logic";
import { resolveOnlineAuthorization } from "./data-source";

export type DstFoldPolicy = "reject" | "earlier" | "later";
export interface RosterTimePolicyDraft {
  id: string; orgId: string; branchId: string; effectiveFrom: string;
  effectiveUntil: string | null; timeZone: string; fold: DstFoldPolicy;
  minimumRestMinutes: number; version: number; status: "draft";
}
export interface RosterDraftInput {
  branchId: string; effectiveFrom: string; effectiveUntil: string | null;
  timeZone: string; fold: DstFoldPolicy; minimumRestMinutes: number;
  expectedVersion: number;
}
type Row = Record<string,unknown>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const day=/^\d{4}-\d{2}-\d{2}$/;
function isoDate(value:unknown): string {
  if(typeof value!=="string"||!day.test(value))throw new Error("Invalid roster policy date");
  const [y,m,d]=value.split("-").map(Number);
  const real=new Date(Date.UTC(y,m-1,d));
  if(y<1900||y>9999||real.getUTCFullYear()!==y||
    real.getUTCMonth()!==m-1||real.getUTCDate()!==d)throw new Error("Invalid roster policy calendar date");
  return value;
}
function validatedId(v:unknown,label:string):string {
  if(typeof v!=="string"||!uuid.test(v))throw new Error("Invalid roster policy "+label);
  return v;
}
function approvedZone(value:string):string {
  if(value!=="UTC"&&!/^[A-Za-z][A-Za-z0-9_+.-]*(\/[A-Za-z0-9_+.-]+)+$/.test(value))
    throw new Error("Named IANA timezone is required");
  try {
    const canonical=new Intl.DateTimeFormat("en",{timeZone:value}).resolvedOptions().timeZone;
    if(!canonical)throw new Error("IANA timezone unavailable");
  }catch{throw new Error("Invalid IANA timezone");}
  return value;
}
export function mapRosterTimePolicyDraft(row:Row,orgId:string):RosterTimePolicyDraft {
  if(row.status!=="draft")throw new Error("Only unapproved draft policies may appear in this editor");
  if(row.org_id!==orgId)throw new Error("Roster policy tenant identity mismatch");
  if(!["reject","earlier","later"].includes(String(row.dst_fold_policy)))throw new Error("Invalid policy fold");
  if(row.dst_gap_policy!=="reject")throw new Error("Unsupported roster gap policy");
  const from=isoDate(row.effective_from),until=row.effective_until==null?null:isoDate(row.effective_until);
  if(until&&until<from)throw new Error("Policy effective interval is invalid");
  if(typeof row.version!=="number"||!Number.isSafeInteger(row.version)||row.version<1)
    throw new Error("Invalid policy revision");
  if(typeof row.minimum_rest_minutes!=="number"||
    !Number.isSafeInteger(row.minimum_rest_minutes)||row.minimum_rest_minutes<0||
    row.minimum_rest_minutes>10080)throw new Error("Invalid minimum rest");
  return {
    id:validatedId(row.id,"ID"), orgId, branchId:validatedId(row.branch_id,"branch ID"),
    effectiveFrom:from,effectiveUntil:until,
    timeZone:approvedZone(String(row.iana_zone)),
    fold:row.dst_fold_policy as DstFoldPolicy,minimumRestMinutes:row.minimum_rest_minutes,
    version:row.version,status:"draft",
  };
}
export function validateRosterDraftInput(input:RosterDraftInput):RosterDraftInput {
  validatedId(input.branchId,"branch");
  const from=isoDate(input.effectiveFrom),until=input.effectiveUntil?isoDate(input.effectiveUntil):null;
  if(until&&until<from)throw new Error("End date cannot precede effective date");
  approvedZone(input.timeZone);
  if(!["reject","earlier","later"].includes(input.fold))
    throw new Error("Explicit DST fold choice is required");
  if(!Number.isSafeInteger(input.minimumRestMinutes)||input.minimumRestMinutes<0||
    input.minimumRestMinutes>10080)throw new Error("Minimum rest must be 0–10080 minutes");
  if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0||
    input.expectedVersion>=2147483647)throw new Error("Invalid expected policy revision");
  return {...input,effectiveFrom:from,effectiveUntil:until};
}
async function authorizedContext(){
  const token=getSessionToken(),user=getSessionUser(),generation=getRemoteWriterGeneration();
  if(!token||!user?.id||!can("staff.manage"))throw new Error("Authorized HR manager session required");
  const base=configFromEnv();
  if(!base)throw new Error("Supabase is not configured");
  const auth=await resolveOnlineAuthorization(token,user.id);
  if(!auth.ok||!["super_admin","admin","manager"].includes(auth.role))
    throw new Error("HR roster policy authority denied");
  if(getSessionToken()!==token||getSessionUser()?.id!==user.id||
    getRemoteWriterGeneration()!==generation||!can("staff.manage"))
    throw new Error("HR policy session changed; retry with current organization");
  return {cfg:{...base,accessToken:token},token,userId:user.id,generation,orgId:auth.orgId};
}
function verifyLive(c:Awaited<ReturnType<typeof authorizedContext>>){
  if(getSessionToken()!==c.token||getSessionUser()?.id!==c.userId||
    getRemoteWriterGeneration()!==c.generation||!can("staff.manage"))
    throw new Error("HR policy session changed during Cloud operation");
}
export async function listRosterTimePolicyDrafts():Promise<RosterTimePolicyDraft[]> {
  const c=await authorizedContext();
  const res=await pgSelectAll<Row>(c.cfg,"staff_roster_time_policies",
    "select=*&order=branch_id.asc,effective_from.desc,id.asc");
  verifyLive(c);
  if(res.error)throw new Error("Draft policy storage unavailable: "+res.error.message);
  if(!Array.isArray(res.data))throw new Error("Invalid roster policy response");
  const drafts=res.data.map(row=>mapRosterTimePolicyDraft(row,c.orgId));
  const keys=new Set<string>();
  for(const draft of drafts){
    const key=draft.branchId+":"+draft.effectiveFrom;
    if(keys.has(key))throw new Error("Duplicate authorized draft policy period");
    keys.add(key);
  }
  return drafts;
}
export async function saveRosterTimePolicyDraft(input:RosterDraftInput):
  Promise<{accepted:true;draft:RosterTimePolicyDraft} | {accepted:false;remote:RosterTimePolicyDraft|null}> {
  const safe=validateRosterDraftInput(input);
  const c=await authorizedContext();
  const res=await pgRpc<Row>(c.cfg,"save_staff_roster_time_policy_draft",{
    p_branch_id:safe.branchId,p_effective_from:safe.effectiveFrom,
    p_effective_until:safe.effectiveUntil,p_iana_zone:safe.timeZone,
    p_dst_fold_policy:safe.fold,p_minimum_rest_minutes:safe.minimumRestMinutes,
    p_expected_version:safe.expectedVersion,
  });
  verifyLive(c);
  if(res.error)throw new Error("Audited draft policy write rejected: "+res.error.message);
  if(!res.data||typeof res.data!=="object")throw new Error("Invalid policy RPC response");
  if(res.data.accepted===true)return {accepted:true,draft:mapRosterTimePolicyDraft(res.data.record as Row,c.orgId)};
  if(res.data.accepted===false)return {
    accepted:false,remote:res.data.remote==null?null:mapRosterTimePolicyDraft(res.data.remote as Row,c.orgId),
  };
  throw new Error("Policy RPC did not return explicit acceptance");
}
