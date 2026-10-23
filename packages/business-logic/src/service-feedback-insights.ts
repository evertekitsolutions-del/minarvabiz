/**
 * SVC-FB03 — branch-scoped offline customer response analytics.
 * Values are staff-recorded, not independently authenticated surveys.
 * This projection is read-only; the caller MUST supply reports.view-scoped
 * ServiceSiteVisit records from listServiceSiteVisits().
 */
import type {ServiceSiteVisit} from "./service-site-visit-register";
import {validateServiceVisitFeedback} from "./service-visit-feedback";
import {validateServiceVisitRecovery} from "./service-visit-recovery";

export interface ServiceFeedbackMonth {
  readonly month:string;
  readonly completed:number;
  readonly rated:number;
  readonly declined:number;
  readonly lowRatings:number;
}
export interface ServiceFeedbackAction {
  readonly visitId:string;
  readonly orderId:string;
  readonly completedOn:string;
  readonly kind:"awaiting_feedback"|"recovery_overdue"|"recovery_due_today"|"recovery_unopened";
  readonly dueOn:string|null;
}
export interface ServiceFeedbackInsights {
  readonly branchId:string|null;
  readonly completedVisits:number;
  readonly responseEligibleVisits:number;
  readonly legacyUntracked:number;
  readonly awaitingFeedback:number;
  readonly rated:number;
  readonly declined:number;
  readonly averageRating:number|null;
  readonly responsePercent:number|null;
  readonly ratingCounts:readonly [number,number,number,number,number];
  readonly lowRatings:number;
  readonly recoveryOpen:number;
  readonly recoveryContacted:number;
  readonly recoveryResolved:number;
  readonly recoveryClosedUnresolved:number;
  readonly recoveryOverdue:number;
  readonly recoveryUnopened:number;
  readonly months:readonly ServiceFeedbackMonth[];
  readonly actions:readonly ServiceFeedbackAction[];
}

function date(value:unknown,label:string):string {
  if(typeof value!=="string"||!/^20\d{2}-\d{2}-\d{2}$/.test(value))
    throw new Error("Invalid feedback "+label);
  const d=new Date(value+"T00:00:00.000Z");
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)
    throw new Error("Invalid feedback "+label);
  return value;
}
function iso(value:unknown,label:string):string {
  if(typeof value!=="string"||
    !/^20\d{2}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)||
    !Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)
    throw new Error("Invalid feedback "+label);
  return value;
}
const rank:Record<ServiceFeedbackAction["kind"],number>={
  recovery_overdue:0,recovery_due_today:1,recovery_unopened:2,awaiting_feedback:3,
};
export function buildServiceFeedbackInsights(visits:readonly ServiceSiteVisit[],
  asOfDay:string,fromDay?:string,toDay?:string):ServiceFeedbackInsights{
  const today=date(asOfDay,"as-of date");
  const start=fromDay?date(fromDay,"start date"):null;
  const end=toDay?date(toDay,"end date"):null;
  if(start&&end&&start>end)throw new Error("Feedback start date exceeds end date");
  if(!Array.isArray(visits)||visits.length>10000)
    throw new Error("Invalid feedback visit collection");
  const keys=new Set<string>(),monthly=new Map<string,ServiceFeedbackMonth>();
  const actions:ServiceFeedbackAction[]=[];
  let branchId:string|null=null,completedVisits=0,responseEligibleVisits=0,
    legacyUntracked=0,awaitingFeedback=0,rated=0,declined=0,totalStars=0,
    lowRatings=0,recoveryOpen=0,recoveryContacted=0,recoveryResolved=0,
    recoveryClosedUnresolved=0,recoveryOverdue=0,recoveryUnopened=0;
  const ratingCounts:[number,number,number,number,number]=[0,0,0,0,0];
  for(const visit of visits){
    if(!visit||typeof visit.id!=="string"||!visit.id||
      typeof visit.orderId!=="string"||!visit.orderId||
      typeof visit.branchId!=="string"||!visit.branchId)
      throw new Error("Invalid feedback visit identity");
    if(keys.has(visit.id))throw new Error("Duplicate feedback visit");
    keys.add(visit.id);
    if(branchId!==null&&branchId!==visit.branchId)
      throw new Error("Feedback report cannot mix branches");
    branchId=visit.branchId;
    if(visit.status!=="completed")continue;
    const completedAt=iso(visit.completedAt,"completion timestamp");
    const updatedAt=iso(visit.updatedAt,"update timestamp");
    if(completedAt>updatedAt)throw new Error("Feedback visit chronology invalid");
    const day=completedAt.slice(0,10);
    if(start&&day<start||end&&day>end)continue;
    completedVisits++;
    const month=day.slice(0,7);
    const m=monthly.get(month)??{month,completed:0,rated:0,declined:0,lowRatings:0};
    m.completed++;
    if(!Object.hasOwn(visit,"feedback")){
      legacyUntracked++;
      monthly.set(month,m);
      continue;
    }
    responseEligibleVisits++;
    const feedback=validateServiceVisitFeedback(visit.feedback,completedAt,updatedAt,"completed");
    if(feedback===null){
      awaitingFeedback++;
      actions.push({visitId:visit.id,orderId:visit.orderId,
        completedOn:day,kind:"awaiting_feedback",dueOn:null});
      if(visit.recovery)throw new Error("Recovery without recorded feedback");
    }else if(feedback.outcome==="declined"){
      declined++;m.declined++;
      if(visit.recovery)throw new Error("Recovery without low customer rating");
    }else{
      rated++;m.rated++;totalStars+=feedback.rating!;
      ratingCounts[feedback.rating!-1]++;
      if(feedback.rating!<=2){
        lowRatings++;m.lowRatings++;
        if(!visit.recovery){
          recoveryUnopened++;
          actions.push({visitId:visit.id,orderId:visit.orderId,
            completedOn:day,kind:"recovery_unopened",dueOn:null});
        }
      }else if(visit.recovery){
        throw new Error("Recovery on non-low-rating feedback");
      }
    }
    if(visit.recovery){
      const recovery=validateServiceVisitRecovery(visit.recovery,feedback,"completed",updatedAt);
      if(!recovery)throw new Error("Recovery record missing");
      if(recovery.status==="open")recoveryOpen++;
      else if(recovery.status==="contacted")recoveryContacted++;
      else if(recovery.status==="resolved")recoveryResolved++;
      else recoveryClosedUnresolved++;
      if(recovery.status==="open"||recovery.status==="contacted"){
        if(recovery.dueOn<today){
          recoveryOverdue++;
          actions.push({visitId:visit.id,orderId:visit.orderId,
            completedOn:day,kind:"recovery_overdue",dueOn:recovery.dueOn});
        }else if(recovery.dueOn===today){
          actions.push({visitId:visit.id,orderId:visit.orderId,
            completedOn:day,kind:"recovery_due_today",dueOn:recovery.dueOn});
        }
      }
    }
    monthly.set(month,m);
  }
  actions.sort((a,b)=>rank[a.kind]-rank[b.kind]||
    (a.dueOn??a.completedOn).localeCompare(b.dueOn??b.completedOn)||
    a.visitId.localeCompare(b.visitId));
  return {branchId,completedVisits,responseEligibleVisits,
    legacyUntracked,awaitingFeedback,rated,declined,
    averageRating:rated?Math.round(totalStars/rated*100)/100:null,
    responsePercent:responseEligibleVisits
      ?Math.round((rated+declined)*10000/responseEligibleVisits)/100:null,
    ratingCounts,lowRatings,recoveryOpen,recoveryContacted,
    recoveryResolved,recoveryClosedUnresolved,recoveryOverdue,recoveryUnopened,
    months:[...monthly.values()].sort((a,b)=>b.month.localeCompare(a.month)),
    actions};
}
function safeCell(s:string):string{
  const neutral=/^\s*[=+\-@]/.test(s)?"'"+s:s;
  return '"'+neutral.replace(/"/g,'""')+'"';
}
/** No phone numbers, feedback comments, signature images, or visit documents. */
export function exportServiceFeedbackInsightsCsv(report:ServiceFeedbackInsights):string{
  const rows:string[][]=[
    ["Metric","Value"],
    ["Completed visits",String(report.completedVisits)],
    ["Feedback-eligible visits",String(report.responseEligibleVisits)],
    ["Legacy feedback-untracked visits",String(report.legacyUntracked)],
    ["Awaiting feedback",String(report.awaitingFeedback)],
    ["Rated",String(report.rated)],
    ["Declined",String(report.declined)],
    ["Average stars",report.averageRating===null?"":report.averageRating.toFixed(2)],
    ["Response percentage",report.responsePercent===null?"":report.responsePercent.toFixed(2)],
    ["Low ratings 1–2",String(report.lowRatings)],
    ["Unopened low-rating recovery",String(report.recoveryUnopened)],
    ["Overdue recovery",String(report.recoveryOverdue)],
    ["Recovery resolved",String(report.recoveryResolved)],
    [],
    ["Completion month","Completed","Rated","Declined","Low ratings"],
    ...report.months.map(m=>[m.month,String(m.completed),String(m.rated),
      String(m.declined),String(m.lowRatings)]),
    [],
    ["Follow-up type","Visit ID","Service order ID","Completed on","Recovery due"],
    ...report.actions.map(a=>[a.kind,a.visitId,a.orderId,a.completedOn,a.dueOn??""]),
  ];
  return rows.map(row=>row.map(safeCell).join(",")).join("\r\n")+"\r\n";
}
