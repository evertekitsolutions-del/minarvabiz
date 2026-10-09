import { assertPermission } from "./permissions";
import { getRemoteWriter } from "./remote-write";
import { exportOutbox, discardAttendanceOutbox, markOutboxSynced, markOutboxFailed } from "./outbox-bridge";
import { enqueueOutbox } from "./outbox-bridge";
import { touchPersistence } from "./autosave";
import { auditAction } from "./audit-actions";
import type { StaffMember, StaffAssignment, IncentiveRuleRecord, StaffIncentivePayout, StaffAttendanceRecord, AttendanceStatus, AppNotification, CustomerCrmProfile, RoleName, StaffStatus, UUID, ServiceType } from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import { calculateIncentive } from "./incentives";
import * as mainStore from "./store";
import * as ordersStore from "./orders-store";
import * as phase9Store from "./phase9-store";
import { checkRosterSlot, rosterRange, validateShiftRule, type ShiftRule, type RosterSlot, type RosterPolicy } from "./workforce-roster";

const staff:StaffMember[]=[{id:"staff-1",name:"Ravi Kumar",phone:"9876511111",role:"tailor",salary:18000,status:"active",joiningDate:"2024-01-15",createdAt:nowISO(),updatedAt:nowISO()},{id:"staff-2",name:"Meena Devi",phone:"9876522222",role:"tailor",salary:16000,status:"active",joiningDate:"2024-03-01",createdAt:nowISO(),updatedAt:nowISO()},{id:"staff-3",name:"Suresh Nair",phone:"9876533333",role:"cashier",salary:14000,status:"active",joiningDate:"2023-11-10",createdAt:nowISO(),updatedAt:nowISO()}];
const assignments:StaffAssignment[]=[];
const attendance:StaffAttendanceRecord[]=[];
const shiftRules: ShiftRule[] = [];
const rosterSlots: RosterSlot[] = [];
const incentiveRules:IncentiveRuleRecord[]=[{id:"rule-1",name:"Ladies tailoring fixed",serviceType:"ladies_tailoring",type:"fixed",value:100,isActive:true,createdAt:nowISO(),updatedAt:nowISO()},{id:"rule-2",name:"Wedding dress 5%",serviceType:"wedding_dress",type:"percentage",value:5,isActive:true,createdAt:nowISO(),updatedAt:nowISO()},{id:"rule-3",name:"T-shirt printing fixed",serviceType:"tshirt_printing",type:"fixed",value:20,isActive:true,createdAt:nowISO(),updatedAt:nowISO()}];
const payouts:StaffIncentivePayout[]=[];
const notifications:AppNotification[]=[{id:"n-1",kind:"low_stock",title:"Low stock alert",body:"Cotton Thread (White) is below minimum (5 left)",href:"/inventory",read:false,createdAt:nowISO()},{id:"n-2",kind:"order_ready",title:"Order ready",body:"An order is ready for delivery",href:"/services",read:false,createdAt:nowISO()}];

export function listStaff(opts?:{status?:StaffStatus;role?:string;query?:string}):StaffMember[]{let list=staff.filter(s=>!s.deletedAt);if(opts?.status)list=list.filter(s=>s.status===opts.status);if(opts?.role)list=list.filter(s=>s.role===opts.role);if(opts?.query?.trim()){const q=opts.query.trim().toLowerCase();list=list.filter(s=>[s.name,s.phone??"",s.email??"",s.role].some(value=>value.toLowerCase().includes(q)));}return list.sort((a,b)=>a.name.localeCompare(b.name));}
export function getStaff(id:UUID){return staff.find(s=>s.id===id&&!s.deletedAt);}
export function createStaff(input:{name:string;phone?:string|null;email?:string|null;role:RoleName|"tailor"|"staff";salary?:number;joiningDate?:string|null;status?:StaffStatus;notes?:string|null}):StaffMember{assertPermission("staff.manage");const name=input.name.trim();if(!name)throw new Error("Staff name is required");const salary=input.salary??0;if(!Number.isFinite(salary)||salary<0)throw new Error("Staff salary must be a finite non-negative amount");const m:StaffMember={id:generateId(),name,phone:input.phone?.trim()||null,email:input.email?.trim()||null,role:input.role,salary,joiningDate:input.joiningDate??null,status:input.status??"active",notes:input.notes?.trim()||null,createdAt:nowISO(),updatedAt:nowISO()};staff.push(m);enqueueOutbox("staff_members",m.id,"insert",m);auditAction("staff.create","staff_members",m.id,null,{...m});touchPersistence();return m;}
export function updateStaff(id:UUID,patch:Partial<StaffMember>):StaffMember|null{assertPermission("staff.manage");const m=getStaff(id);if(!m)return null;if(patch.name!==undefined&&!patch.name.trim())throw new Error("Staff name is required");if(patch.salary!==undefined&&(!Number.isFinite(patch.salary)||patch.salary<0))throw new Error("Staff salary must be a finite non-negative amount");const before={...m};const allowed=["name","phone","email","role","salary","joiningDate","status","notes"] as const;for(const key of allowed){if(Object.prototype.hasOwnProperty.call(patch,key)){let value=patch[key];if(key==="name"&&typeof value==="string")value=value.trim() as never;if((key==="phone"||key==="email"||key==="notes")&&typeof value==="string")value=(value.trim()||null) as never;if(value!==undefined)m[key]=value as never;}}m.updatedAt=nowISO();enqueueOutbox("staff_members",m.id,"update",m);auditAction("staff.update","staff_members",m.id,before,{...m});touchPersistence();return m;}
export function archiveStaff(id:UUID,reason:string):{staff:StaffMember|null;error?:string}{assertPermission("staff.manage");const m=getStaff(id);if(!m)return{staff:null,error:"Staff not found"};const archiveReason=reason.trim();if(archiveReason.length<3)return{staff:null,error:"Archive reason is required"};const active=assignments.some(a=>a.staffId===id&&a.status!=="completed"&&a.status!=="cancelled");if(active)return{staff:null,error:"Complete or cancel active staff assignments before archiving"};const before={...m};m.status="inactive";m.deletedAt=nowISO();m.updatedAt=m.deletedAt;enqueueOutbox("staff_members",m.id,"update",m);auditAction("staff.archive","staff_members",m.id,before,{...m,archiveReason});touchPersistence();return{staff:m};}
export function listArchivedStaff():StaffMember[]{return staff.filter(member=>Boolean(member.deletedAt)).sort((a,b)=>(b.deletedAt??"").localeCompare(a.deletedAt??""));}
export function restoreArchivedStaff(id:UUID):{staff:StaffMember|null;error?:string}{assertPermission("staff.manage");const m=staff.find(member=>member.id===id&&Boolean(member.deletedAt));if(!m)return{staff:null,error:"Staff member is not in Trash"};const before={...m};m.deletedAt=null;m.status="active";m.updatedAt=nowISO();enqueueOutbox("staff_members",m.id,"update",{...m});auditAction("staff.restore","staff_members",m.id,before,{...m});touchPersistence();return{staff:m};}
export function purgeArchivedStaff(id:UUID):{purged:boolean;error?:string}{assertPermission("staff.manage");const index=staff.findIndex(member=>member.id===id&&Boolean(member.deletedAt));if(index<0)return{purged:false,error:"Staff member is not in Trash"};const [member]=staff.splice(index,1);const purgedAt=nowISO();enqueueOutbox("staff_members",member.id,"delete",{id:member.id,deletedAt:member.deletedAt??null,purgedAt});auditAction("staff.purge","staff_members",member.id,{...member},{id:member.id,purgedAt});touchPersistence();return{purged:true};}

export function listAttendance(opts?:{staffId?:UUID;from?:string;to?:string}):StaffAttendanceRecord[]{assertPermission("staff.manage");let list=attendance.map(r=>({...r}));if(opts?.staffId)list=list.filter(r=>r.staffId===opts.staffId);if(opts?.from)list=list.filter(r=>r.date>=opts.from!);if(opts?.to)list=list.filter(r=>r.date<=opts.to!);return list.sort((a,b)=>b.date.localeCompare(a.date)||a.staffId.localeCompare(b.staffId));}
export type AttendanceInput = {staffId:UUID;date:string;status:AttendanceStatus;clockIn?:string|null;clockOut?:string|null;breakMinutes?:number;overtimeMinutes?:number;notes?:string|null;branchId?:UUID|null};

export function setAttendance(input:AttendanceInput):StaffAttendanceRecord {
  assertPermission("staff.manage");
  const member=getStaff(input.staffId);
  if(!member) throw new Error("Staff not found");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0,10)!==input.date) throw new Error("Attendance date must be a valid YYYY-MM-DD date");
  if(!["present","absent","half_day","leave","holiday"].includes(input.status)) throw new Error("Invalid attendance status");
  const existing=attendance.find(r=>r.staffId===input.staffId&&r.date===input.date);
  const breakMinutes=input.breakMinutes??existing?.breakMinutes??0;
  const overtimeMinutes=input.overtimeMinutes??existing?.overtimeMinutes??0;
  if(!Number.isInteger(breakMinutes)||breakMinutes<0||breakMinutes>2147483647||!Number.isInteger(overtimeMinutes)||overtimeMinutes<0||overtimeMinutes>2147483647) throw new Error("Attendance minutes must be non-negative integers");
  const clockIn=input.clockIn===undefined?existing?.clockIn??null:input.clockIn;
  const clockOut=input.clockOut===undefined?existing?.clockOut??null:input.clockOut;
  for(const clock of [clockIn,clockOut]) if(clock!==null && (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(clock)||!Number.isFinite(Date.parse(clock)))) throw new Error("Attendance clock must include a valid date and timezone");
  if(clockOut&&!clockIn) throw new Error("Clock-in is required before clock-out");
  if(clockIn&&clockOut && (Date.parse(clockOut)<Date.parse(clockIn)||breakMinutes*60000>Date.parse(clockOut)-Date.parse(clockIn))) throw new Error("Attendance clock range or break duration is invalid");
  if(input.branchId!==undefined && (existing ? input.branchId !== (existing.branchId??null) : member.branchId && input.branchId!==member.branchId))throw new Error("Attendance branch must match the staff branch");
  const before=existing?{...existing}:null;
  const patch={status:input.status,clockIn,clockOut,breakMinutes,overtimeMinutes,notes:input.notes===undefined?existing?.notes??null:input.notes?.trim()||null,branchId:input.branchId===undefined?existing?.branchId??member.branchId??null:input.branchId,staffName:member.name,version:(existing?.version??(existing?1:0))+1,updatedAt:nowISO()};
  const record:StaffAttendanceRecord=existing?Object.assign(existing,patch):{id:generateId(),staffId:member.id,date:input.date,createdAt:nowISO(),...patch};
  if(!existing) attendance.push(record);
  enqueueOutbox("staff_attendance",record.id,existing?"update":"insert",{...record});
  auditAction(existing?"attendance.update":"attendance.create","staff_attendance",record.id,before,{...record});
  touchPersistence();
  return record;
}
/** Preserve queued corrections when cloud data reloads; only current tenant's hydrated staff qualify. */
export function hydrateAttendanceFromCloud(rows:StaffAttendanceRecord[]):void {
  const dayKey=(row:StaffAttendanceRecord)=>`${row.staffId}:${row.date}`;
  const reconciled=new Map(rows.map(row=>[dayKey(row),{...row}]));
  for(const event of exportOutbox().filter(e=>e.aggregateType==="staff_attendance"&&(e.status==="pending"||e.status==="failed")).sort((a,b)=>a.sequence-b.sequence)){
    const local=event.payload as StaffAttendanceRecord;
    if(local?.id&&staff.some(m=>m.id===local.staffId))reconciled.set(dayKey(local),{...local});
  }
  attendance.length=0;attendance.push(...reconciled.values());
}
const attendanceWrites=new Map<string,Promise<void>>();
/** Save locally first, then drain immutable versions in order when a cloud writer is registered. */
export async function saveAttendance(input:AttendanceInput):Promise<StaffAttendanceRecord> {
  const record=setAttendance(input);
  return persistAttendanceRecord(record);
}
export async function retryAttendance(id:UUID):Promise<StaffAttendanceRecord> {
  assertPermission("staff.manage");
  const record=attendance.find(r=>r.id===id);
  if(!record||!staff.some(m=>m.id===record.staffId))throw new Error("Staff attendance not found");
  return persistAttendanceRecord(record);
}
async function persistAttendanceRecord(record:StaffAttendanceRecord):Promise<StaffAttendanceRecord> {
  const writer=getRemoteWriter()?.upsertAttendance;
  if(!writer)return record;
  const previous=attendanceWrites.get(record.id)??Promise.resolve();
  const next=previous.catch(()=>{}).then(async()=>{
    for(const event of exportOutbox().filter(e=>e.aggregateType==="staff_attendance"&&e.aggregateId===record.id&&(e.status==="pending"||e.status==="failed")).sort((a,b)=>a.sequence-b.sequence)){
      try{await writer({...event.payload as StaffAttendanceRecord},event);markOutboxSynced([event.id]);}
      catch(error){markOutboxFailed(event.id,error instanceof Error?error.message:String(error));throw error;}
    }
  });
  attendanceWrites.set(record.id,next);
  try{await next;}finally{if(attendanceWrites.get(record.id)===next)attendanceWrites.delete(record.id);}
  return record;
}
export async function reviewAttendanceConflict(id:UUID){
  assertPermission("staff.manage");
  const local=attendance.find(r=>r.id===id);
  const reader=getRemoteWriter()?.getAttendance;
  if(!local||!staff.some(m=>m.id===local.staffId)||!reader)throw new Error("Online attendance review is unavailable");
  const localSnapshot={...local};
  const remote=await reader(id,localSnapshot.staffId,localSnapshot.date);
  if(!remote)throw new Error("Remote attendance entry is unavailable; retry the pending creation");
  if(remote.staffId!==localSnapshot.staffId||remote.date!==localSnapshot.date)throw new Error("Remote attendance identity does not match the reviewed day");
  return {local:localSnapshot,remote:{...remote}};
}
export async function resolveAttendanceConflict(id:UUID,choice:"local"|"remote",expectedRemoteVersion:number,expectedLocalVersion:number){
  assertPermission("staff.manage");
  if(choice!=="local"&&choice!=="remote")throw new Error("Invalid attendance resolution choice");
  if(attendanceWrites.has(id))throw new Error("Wait for the current attendance save before resolving");
  const {local,remote}=await reviewAttendanceConflict(id);
  if((local.version??1)!==expectedLocalVersion)throw new Error("Local attendance changed since review; review it again");
  if((remote.version??1)!==expectedRemoteVersion)throw new Error("Remote attendance changed; review it again before resolving");
  if(choice==="local"&&!getStaff(remote.staffId))throw new Error("Restore the archived staff member before applying a new correction");
  if(attendanceWrites.has(id)||attendance.find(r=>r.id===id)?.version!==local.version)throw new Error("Local attendance changed; review it again before resolving");
  discardAttendanceOutbox(id);
  for(let i=attendance.length-1;i>=0;i--)if(attendance[i].staffId===remote.staffId&&attendance[i].date===remote.date)attendance.splice(i,1);
  attendance.push({...remote});
  auditAction("attendance.resolve","staff_attendance",id,{local,remote},{choice,expectedRemoteVersion});touchPersistence();
  if(choice==="local")return saveAttendance({staffId:remote.staffId,date:remote.date,status:local.status,clockIn:local.clockIn,clockOut:local.clockOut,breakMinutes:local.breakMinutes,overtimeMinutes:local.overtimeMinutes,notes:local.notes,branchId:local.branchId});
  return {...remote};
}
export function attendanceSummary(from:string,to:string){const rows=listAttendance({from,to});const summary=new Map<UUID,{present:number;absent:number;halfDay:number;leave:number;holiday:number;overtimeMinutes:number}>();for(const row of rows){const v=summary.get(row.staffId)??{present:0,absent:0,halfDay:0,leave:0,holiday:0,overtimeMinutes:0};if(row.status==="present")v.present++;else if(row.status==="absent")v.absent++;else if(row.status==="half_day")v.halfDay++;else if(row.status==="leave")v.leave++;else if(row.status==="holiday")v.holiday++;v.overtimeMinutes+=row.overtimeMinutes;summary.set(row.staffId,v);}return summary;}

export function listAssignments(opts?:{staffId?:UUID;orderId?:UUID}){let list=[...assignments];if(opts?.staffId)list=list.filter(a=>a.staffId===opts.staffId);if(opts?.orderId)list=list.filter(a=>a.orderId===opts.orderId);return list.sort((a,b)=>b.assignedAt.localeCompare(a.assignedAt));}
export function assignStaffToOrder(input:{staffId:UUID;orderId:UUID;notes?:string|null}){assertPermission("orders.assign");const member=getStaff(input.staffId);if(!member)return{assignment:null,errors:["Staff not found"]};if(member.status!=="active")return{assignment:null,errors:["Only active staff can receive new assignments"]};const order=ordersStore.getOrder(input.orderId);if(!order)return{assignment:null,errors:["Order not found"]};const existing=assignments.find(a=>a.orderId===input.orderId&&a.staffId===input.staffId&&a.status!=="cancelled");if(existing)return{assignment:null,errors:["Already assigned"]};const a:StaffAssignment={id:generateId(),staffId:input.staffId,staffName:member.name,orderId:input.orderId,orderNumber:order.orderNumber,serviceType:order.serviceType,assignedAt:nowISO(),status:"assigned",notes:input.notes??null};assignments.push(a);enqueueOutbox("staff_assignments",a.id,"insert",a);order.assignedTailorId=input.staffId;order.updatedAt=nowISO();order.version+=1;pushNotification({kind:"system",title:"Order assigned",body:`${order.orderNumber} assigned to ${member.name}`,href:"/services"});touchPersistence();return{assignment:a,errors:[]};}
export function completeAssignment(id:UUID){assertPermission("orders.assign");const a=assignments.find(x=>x.id===id);if(!a||a.status==="cancelled")return null;a.status="completed";a.completedAt=nowISO();enqueueOutbox("staff_assignments",a.id,"update",a);const order=ordersStore.getOrder(a.orderId);if(order){const rule=findRule(order.serviceType);if(rule){const amount=calculateIncentive(order.price,{type:rule.type,value:rule.value,serviceType:rule.serviceType??undefined});if(amount>0&&!payouts.some(p=>p.orderId===a.orderId&&p.staffId===a.staffId&&p.ruleId===rule.id)){payouts.push({id:generateId(),staffId:a.staffId,staffName:a.staffName,orderId:a.orderId,orderNumber:a.orderNumber,ruleId:rule.id,amount,calculatedAt:nowISO(),paid:false});enqueueOutbox("staff_incentive_payouts",payouts[payouts.length-1].id,"insert",payouts[payouts.length-1]);}}}touchPersistence();return a;}
export function listIncentiveRules(){return incentiveRules.filter(r=>r.isActive);}
export function upsertIncentiveRule(input:{id?:UUID;name:string;serviceType?:string|null;type:"fixed"|"percentage";value:number}){assertPermission("staff.manage");if(input.id){const existing=incentiveRules.find(r=>r.id===input.id);if(existing){Object.assign(existing,input,{updatedAt:nowISO()});enqueueOutbox("incentive_rules",existing.id,"update",existing);touchPersistence();return existing;}}const r:IncentiveRuleRecord={id:generateId(),name:input.name,serviceType:input.serviceType??null,type:input.type,value:input.value,isActive:true,createdAt:nowISO(),updatedAt:nowISO()};incentiveRules.push(r);enqueueOutbox("incentive_rules",r.id,"insert",r);touchPersistence();return r;}
export function listIncentivePayouts(staffId?:UUID){let list=[...payouts];if(staffId)list=list.filter(p=>p.staffId===staffId);return list.sort((a,b)=>b.calculatedAt.localeCompare(a.calculatedAt));}
export function markIncentivePaid(id:UUID){assertPermission("staff.manage");const p=payouts.find(x=>x.id===id);if(!p)return null;p.paid=true;p.paidAt=nowISO();enqueueOutbox("staff_incentive_payouts",p.id,"update",p);touchPersistence();return p;}


/** HR-004 roster domain, independent of the attendance ledger. All mutations
 * require staff.manage and emit audit + outbox, including cancellations. */
export function listShiftRules(includeInactive = false): ShiftRule[] {
  assertPermission("staff.manage");
  return shiftRules.filter(rule => includeInactive || rule.active).map(rule => ({ ...rule }));
}
export function listRosterSlots(from?: string, to?: string, staffId?: string): RosterSlot[] {
  assertPermission("staff.manage");
  if (from || to) {
    if (!from || !to) throw new Error("Roster listing needs both range boundaries");
    return rosterRange(rosterSlots, from, to, staffId);
  }
  return rosterSlots.filter(slot => !staffId || slot.staffId === staffId).map(slot => ({ ...slot }));
}
export function createShiftRule(input: Omit<ShiftRule, "id">): ShiftRule {
  assertPermission("staff.manage");
  const next: ShiftRule = { ...input, id: generateId(), name: input.name.trim() };
  validateShiftRule(next);
  if (next.branchId && !phase9Store.listBranches().some(branch => branch.id === next.branchId)) throw new Error("Shift branch does not exist");
  if (shiftRules.some(rule => rule.branchId === next.branchId && rule.name.toLowerCase() === next.name.toLowerCase())) throw new Error("Shift name is already used in this branch");
  shiftRules.push(next);
  enqueueOutbox("staff_shift_rules", next.id, "insert", { ...next });
  auditAction("roster.shift.create", "staff_shift_rules", next.id, null, { ...next });
  touchPersistence();
  return { ...next };
}
export function updateShiftRule(id: UUID, changes: Partial<Omit<ShiftRule, "id">>): ShiftRule {
  assertPermission("staff.manage");
  const old = shiftRules.find(rule => rule.id === id);
  if (!old) throw new Error("Shift template not found");
  const next: ShiftRule = { ...old, ...changes, id: old.id, name: (changes.name ?? old.name).trim() };
  validateShiftRule(next);
  if (next.branchId && !phase9Store.listBranches().some(branch => branch.id === next.branchId)) throw new Error("Shift branch does not exist");
  if (shiftRules.some(rule => rule.id !== id && rule.branchId === next.branchId && rule.name.toLowerCase() === next.name.toLowerCase())) throw new Error("Shift name is already used in this branch");
  if (rosterSlots.some(slot => slot.shiftRuleId === id) && (
    old.startTime !== next.startTime || old.endTime !== next.endTime ||
    old.unpaidBreakMinutes !== next.unpaidBreakMinutes || old.branchId !== next.branchId
  )) throw new Error("Historical shift timing and branch cannot change; create a new shift template");
  const previous = { ...old };
  Object.assign(old, next);
  enqueueOutbox("staff_shift_rules", id, "update", { ...old });
  auditAction("roster.shift.update", "staff_shift_rules", id, previous, { ...old });
  touchPersistence();
  return { ...old };
}
export function assignRosterSlot(input: Omit<RosterSlot, "id" | "version"> & { id?: UUID; expectedVersion?: number }, policy?: RosterPolicy): RosterSlot {
  assertPermission("staff.manage");
  const old = input.id ? rosterSlots.find(slot => slot.id === input.id) : undefined;
  if (input.id && !old) throw new Error("Roster assignment not found");
  if (old && input.expectedVersion !== old.version) throw new Error("Roster revision conflict");
  const next: RosterSlot = {
    id: old?.id ?? generateId(),
    staffId: input.staffId, workDate: input.workDate, shiftRuleId: input.shiftRuleId,
    branchId: input.branchId, status: input.status,
    version: old ? old.version + 1 : 1,
  };
  const checked = checkRosterSlot({ candidate: next, slots: rosterSlots, shifts: shiftRules, staff: staff.find(member => member.id === input.staffId) ?? null, policy });
  if (!checked.ok) throw new Error(checked.errors.join("; "));
  const previous = old ? { ...old } : null;
  if (old) Object.assign(old, next);
  else rosterSlots.push({ ...next });
  enqueueOutbox("staff_roster_slots", next.id, old ? "update" : "insert", { ...next });
  auditAction(old ? "roster.slot.update" : "roster.slot.create", "staff_roster_slots", next.id, previous, { ...next });
  touchPersistence();
  return { ...next };
}

/** Restore Phase 6 state from a persisted snapshot without emitting outbox events. */
export function exportPhase6State(){return{staff:[...staff],attendance:[...attendance],shiftRules:shiftRules.map(rule=>({...rule})),rosterSlots:rosterSlots.map(slot=>({...slot})),assignments:[...assignments],incentiveRules:[...incentiveRules],payouts:[...payouts],notifications:[...notifications]};}

export function hydratePhase6(input:{staff?:StaffMember[];attendance?:StaffAttendanceRecord[];shiftRules?:ShiftRule[];rosterSlots?:RosterSlot[];assignments?:StaffAssignment[];incentiveRules?:IncentiveRuleRecord[];payouts?:StaffIncentivePayout[];notifications?:AppNotification[]}):void{
  if(input.staff){staff.length=0;staff.push(...input.staff);}
  if(input.attendance){attendance.length=0;attendance.push(...input.attendance);}
  if(input.shiftRules || input.rosterSlots) {
    const rules = input.shiftRules ?? shiftRules;
    const slots = input.rosterSlots ?? rosterSlots;
    const ruleIds = new Set<string>();
    for (const rule of rules) {
      validateShiftRule(rule);
      if (ruleIds.has(rule.id)) throw new Error("Duplicate shift rule ID in snapshot");
      ruleIds.add(rule.id);
    }
    const seenSlots = new Set<string>();
    const visited: RosterSlot[] = [];
    for (const slot of slots) {
      if (seenSlots.has(slot.id)) throw new Error("Duplicate roster slot ID in snapshot");
      seenSlots.add(slot.id);
      const member = staff.find(m => m.id === slot.staffId);
      // Historic slots retain their original branch even after a staff transfer.
      const originalContext = member ? { id: member.id, status: "active", branchId: slot.branchId } : null;
      const check = checkRosterSlot({
        candidate: { ...slot, version: 1 }, slots: visited, shifts: rules.map(rule => ({ ...rule, active: true })),
        staff: originalContext,
      });
      if (!check.ok || !Number.isSafeInteger(slot.version) || slot.version < 1) {
        throw new Error("Invalid roster snapshot: " + (!check.ok ? check.errors.join("; ") : "version"));
      }
      visited.push(slot);
    }
    if(input.shiftRules){shiftRules.length=0;shiftRules.push(...input.shiftRules.map(rule=>({...rule})));}
    if(input.rosterSlots){rosterSlots.length=0;rosterSlots.push(...input.rosterSlots.map(slot=>({...slot})));}
  }
  if(input.assignments){assignments.length=0;assignments.push(...input.assignments);}
  if(input.incentiveRules){incentiveRules.length=0;incentiveRules.push(...input.incentiveRules);}
  if(input.payouts){payouts.length=0;payouts.push(...input.payouts);}
  if(input.notifications){notifications.length=0;notifications.push(...input.notifications);}
}

/** Build the customer-facing CRM aggregate used by the customer profile UI. */
export function getCustomerCrmProfile(customerId:UUID):CustomerCrmProfile|null{
  const customer=mainStore.getCustomer(customerId);
  if(!customer)return null;
  const profiles=ordersStore.listMeasurementProfiles(customerId);
  const customerOrders=ordersStore.listOrders({customerId});
  const customerSales=mainStore.listSales().filter(s=>s.customerId===customerId);
  return{
    customer,
    measurementCount:profiles.length,
    orderCount:customerOrders.length,
    saleCount:customerSales.length,
    recentOrders:customerOrders.slice(0,5).map(order=>({id:order.id,orderNumber:order.orderNumber,status:order.status,price:order.price,date:order.orderDate})),
    recentSales:customerSales.slice(0,5).map(sale=>({id:sale.id,invoiceNumber:sale.invoiceNumber,total:sale.total,date:sale.saleDate})),
  };
}

function findRule(serviceType:ServiceType){return incentiveRules.find(r=>r.isActive&&r.serviceType===serviceType)||incentiveRules.find(r=>r.isActive&&!r.serviceType);}
export function staffProductivity(staffId:UUID){const assigned=assignments.filter(a=>a.staffId===staffId),completed=assigned.filter(a=>a.status==="completed"),incentives=payouts.filter(p=>p.staffId===staffId),totalIncentive=incentives.reduce((s,p)=>s+p.amount,0),unpaid=incentives.filter(p=>!p.paid).reduce((s,p)=>s+p.amount,0);return{assigned:assigned.length,completed:completed.length,totalIncentive,unpaidIncentive:unpaid};}
export function listNotifications(unreadOnly=false){let list=[...notifications];if(unreadOnly)list=list.filter(n=>!n.read);return list.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
export function pushNotification(input:{kind:AppNotification["kind"];title:string;body:string;href?:string|null;meta?:Record<string,unknown>}){const n:AppNotification={id:generateId(),kind:input.kind,title:input.title,body:input.body,href:input.href??null,read:false,createdAt:nowISO(),meta:input.meta};notifications.unshift(n);touchPersistence();return n;}
export function markNotificationRead(id:UUID){const n=notifications.find(x=>x.id===id);if(n&&!n.read){n.read=true;touchPersistence();}}
export function markAllNotificationsRead(){let changed=false;notifications.forEach(n=>{if(!n.read){n.read=true;changed=true;}});if(changed)touchPersistence();}
export function unreadNotificationCount(){return notifications.filter(n=>!n.read).length;}
export type NotificationChannel="in_app"|"sms"|"whatsapp"|"email";
export interface NotificationPayload{channel:NotificationChannel;to:string;template:string;data:Record<string,string>}
export async function sendNotification(payload:NotificationPayload){if(payload.channel==="in_app")return{ok:true,provider:"in_app"};return{ok:false,provider:"unconfigured",error:`No ${payload.channel} provider is configured.`};}


function upsertOperationalNotification(input: {
  key: string;
  kind: AppNotification["kind"];
  title: string;
  body: string;
  href?: string | null;
}) {
  const existing = notifications.find((n) => n.meta?.key === input.key);
  if (existing) {
    existing.kind = input.kind;
    existing.title = input.title;
    existing.body = input.body;
    existing.href = input.href ?? null;
    existing.createdAt = nowISO();
    return existing;
  }
  return pushNotification({
    kind: input.kind,
    title: input.title,
    body: input.body,
    href: input.href ?? null,
    meta: { key: input.key, operational: true },
  });
}

/**
 * Rebuild high-value operational alerts without creating duplicate rows.
 * The caller may add runtime-only signals such as license, sync, or backup state.
 */
export function refreshOperationalNotifications(runtime?: {
  licenseDaysRemaining?: number | null;
  syncError?: string | null;
  backupReminder?: boolean;
}): AppNotification[] {
  const lowStock = mainStore.listProducts().filter((p) => p.isActive && p.stockQuantity <= p.minimumStock);
  if (lowStock.length > 0) {
    upsertOperationalNotification({
      key: "ops:low-stock",
      kind: "low_stock",
      title: "Low stock alert",
      body: `${lowStock.length} item${lowStock.length === 1 ? "" : "s"} at or below minimum stock.`,
      href: "/inventory",
    });
  }

  const activeOrders = ordersStore.listOrders();
  const ready = activeOrders.filter((o) => o.status === "ready_to_deliver");
  if (ready.length > 0) {
    upsertOperationalNotification({
      key: "ops:ready-orders",
      kind: "order_ready",
      title: "Orders ready for delivery",
      body: `${ready.length} order${ready.length === 1 ? "" : "s"} ready for delivery.`,
      href: "/services",
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const due = activeOrders.filter((o) => o.status !== "delivered" && o.status !== "cancelled" && o.deliveryDate && o.deliveryDate.slice(0, 10) <= today);
  if (due.length > 0) {
    upsertOperationalNotification({
      key: "ops:pending-delivery",
      kind: "pending_delivery",
      title: "Pending delivery",
      body: `${due.length} order${due.length === 1 ? "" : "s"} due today or overdue.`,
      href: "/delivery",
    });
  }

  const outstanding = mainStore.listOutstandingCustomers();
  if (outstanding.length > 0) {
    const amount = outstanding.reduce((sum, customer) => sum + customer.outstandingBalance, 0);
    upsertOperationalNotification({
      key: "ops:payment-due",
      kind: "payment_due",
      title: "Customer payments due",
      body: `${outstanding.length} customer${outstanding.length === 1 ? "" : "s"} have outstanding balances totalling ${amount.toFixed(2)}.`,
      href: "/payments",
    });
  }

  const days = runtime?.licenseDaysRemaining;
  if (typeof days === "number" && days >= 0 && days <= 30) {
    upsertOperationalNotification({
      key: "ops:license-expiry",
      kind: "license_expiry",
      title: "License expiry warning",
      body: `License expires in ${days} day${days === 1 ? "" : "s"}. Renew before expiry to avoid feature restrictions.`,
      href: "/license",
    });
  }

  if (runtime?.syncError) {
    upsertOperationalNotification({
      key: "ops:sync-error",
      kind: "sync_error",
      title: "Cloud sync needs attention",
      body: runtime.syncError,
      href: "/system",
    });
  }

  if (runtime?.backupReminder) {
    upsertOperationalNotification({
      key: "ops:backup-reminder",
      kind: "backup_reminder",
      title: "Backup reminder",
      body: "A verified backup is due. Create or verify a backup before major changes or updates.",
      href: "/backup",
    });
  }

  touchPersistence();
  return listNotifications();
}
