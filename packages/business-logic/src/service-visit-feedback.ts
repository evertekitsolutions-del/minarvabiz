/**
 * SVC-FB01 — staff-recorded post-visit customer response, stored locally.
 * This does not authenticate the customer, submit a public review, or send
 * a survey automatically. Staff must attest an actual customer response.
 */
export type ServiceVisitFeedbackSource="in_person"|"phone"|"whatsapp";
export interface ServiceVisitFeedback{
  readonly outcome:"rated"|"declined";
  readonly rating:1|2|3|4|5|null;
  readonly comment:string;
  readonly source:ServiceVisitFeedbackSource;
  readonly recordedAt:string;
}
export function validateServiceVisitFeedback(raw:unknown,completedAt:string|null,
  updatedAt:string,status:string):ServiceVisitFeedback|null{
  if(raw===null)return null;
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("Invalid customer feedback record");
  const x=raw as Record<string,unknown>;
  const keys=["outcome","rating","comment","source","recordedAt"];
  if(keys.some(k=>!Object.hasOwn(x,k))||Object.keys(x).some(k=>!keys.includes(k)))
    throw new Error("Invalid customer feedback fields");
  if(status!=="completed"||!completedAt)throw new Error("Feedback requires a completed visit");
  if(x.outcome!=="rated"&&x.outcome!=="declined")
    throw new Error("Invalid customer feedback outcome");
  if(!["in_person","phone","whatsapp"].includes(x.source as string))
    throw new Error("Invalid customer feedback source");
  if(typeof x.comment!=="string"||x.comment.length>1000||
     /[\u0000-\u001f\u007f]/.test(x.comment))
    throw new Error("Invalid customer feedback comment");
  const comment=x.comment.trim();
  if(x.outcome==="rated"){
    if(!Number.isInteger(x.rating)||!(x.rating as number>=1&&x.rating as number<=5))
      throw new Error("Customer feedback rating must be 1–5");
  }else{
    if(x.rating!==null||comment.length<3)
      throw new Error("Declined feedback must have a reason without a rating");
  }
  if(typeof x.recordedAt!=="string"||
    !/^20\d{2}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x.recordedAt)||
    !Number.isFinite(Date.parse(x.recordedAt))||
    new Date(x.recordedAt).toISOString()!==x.recordedAt||
    x.recordedAt<completedAt||x.recordedAt>updatedAt)
    throw new Error("Feedback timestamp outside completed visit chronology");
  return {outcome:x.outcome,rating:x.outcome==="rated"?x.rating as 1|2|3|4|5:null,
    comment,source:x.source as ServiceVisitFeedbackSource,recordedAt:x.recordedAt};
}
export function feedbackNeedsRecovery(v:ServiceVisitFeedback|null|undefined):boolean{
  return v?.outcome==="rated"&&v.rating!==null&&v.rating<=2;
}
export function feedbackAuditMetadata(v:ServiceVisitFeedback|null|undefined){
  return v?{outcome:v.outcome,rating:v.rating,source:v.source,recordedAt:v.recordedAt,
    needsRecovery:feedbackNeedsRecovery(v)}:null;
}
