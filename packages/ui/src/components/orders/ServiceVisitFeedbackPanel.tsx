"use client";
import * as React from "react";
import {
  buildManualServiceWhatsAppLink,feedbackNeedsRecovery,parseGoogleReviewUrl,
  recordServiceVisitFeedback,type ServiceSiteVisit,
  type ServiceVisitFeedbackSource,
} from "@minarvabiz/business-logic";
import {Button} from "../Button";
import {inputClass,selectClass} from "../forms/FormField";

/** Staff-confirmed response only. No auto message or selective review request. */
export function ServiceVisitFeedbackPanel({visit,canWrite,mutate,customerPhone}:{
  visit:ServiceSiteVisit;canWrite:boolean;customerPhone?:string|null;
  mutate:(fn:()=>unknown,success:string)=>void;
}){
  const [rating,setRating]=React.useState("5");
  const [source,setSource]=React.useState<ServiceVisitFeedbackSource>("in_person");
  const [comment,setComment]=React.useState("");
  const [confirm,setConfirm]=React.useState(false);
  const [phoneOverride,setPhoneOverride]=React.useState("");
  const [reviewUrl,setReviewUrl]=React.useState("");
  const [shareConsent,setShareConsent]=React.useState(false);
  const [error,setError]=React.useState<string|null>(null);
  const existing=visit.feedback;
  const writable=canWrite&&visit.status==="completed"&&
    Object.hasOwn(visit,"feedback")&&existing===null;
  const canFollowUp=visit.status==="completed";
  const needsRecovery=feedbackNeedsRecovery(existing);
  function capture(outcome:"rated"|"declined"){
    mutate(()=>recordServiceVisitFeedback({
      visitId:visit.id,expectedVersion:visit.version,
      outcome,rating:outcome==="rated"?Number(rating):null,
      comment,source,customerResponseConfirmed:confirm,
    }),outcome==="rated"?"Customer response recorded offline":
      "Customer feedback refusal recorded offline");
  }
  function openDraft(){
    try{
      if(!shareConsent)throw new Error("Confirm the customer agreed to WhatsApp follow-up");
      const link=reviewUrl.trim()?parseGoogleReviewUrl(reviewUrl):"";
      const message=[
        "Thank you for using our service.",
        "We would appreciate your feedback about the completed visit.",
        "If anything needs attention, please reply so we can help.",
        ...(link?["If you wish, you can also leave a Google review: "+link]:[]),
        "A review is entirely optional.",
      ].join("\n");
      const href=buildManualServiceWhatsAppLink(
        (phoneOverride.trim()||customerPhone||"").trim(),message);
      window.open(href,"_blank","noopener,noreferrer");
      setError(null);
    }catch(e){setError(e instanceof Error?e.message:"Could not prepare WhatsApp draft");}
  }
  if(!Object.hasOwn(visit,"feedback"))return null;
  return <details className="mt-2 max-w-[600px] rounded border border-slate-200 bg-white p-2">
    <summary className="cursor-pointer font-medium">
      Customer service feedback: {existing?.outcome==="rated"
        ? String(existing.rating)+"/5 stars":
        existing?.outcome==="declined"?"Declined":"Not yet collected"}
      {needsRecovery?" — requires private follow-up":""}
    </summary>
    <p className="mt-1 text-xs text-slate-600">
      Staff-recorded response, not a verified online survey. Follow-up and
      public reviews are always optional.
    </p>
    {existing&&<div className="mt-2 text-xs">
      <p>{existing.outcome==="rated"
        ? "Customer rating: "+existing.rating+"/5" : "Customer declined feedback"}</p>
      {existing.comment&&<p className="whitespace-pre-wrap break-words">{existing.comment}</p>}
      <p className="text-slate-500">Source: {existing.source.replace("_"," ")},
        {" "}{new Date(existing.recordedAt).toLocaleString()}</p>
      {needsRecovery&&<p className="font-semibold text-amber-700">
        Service recovery priority: follow up privately with the customer.
      </p>}
    </div>}
    {writable&&<div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        <label className="text-xs font-medium">Rating
          <select className={selectClass+" mt-1"} aria-label={"Customer rating "+visit.id}
            value={rating} onChange={e=>setRating(e.target.value)}>
            {[1,2,3,4,5].map(n=><option key={n} value={n}>{n}/5</option>)}
          </select>
        </label>
        <label className="text-xs font-medium">How response was received
          <select className={selectClass+" mt-1"} aria-label={"Feedback source "+visit.id}
            value={source} onChange={e=>setSource(e.target.value as ServiceVisitFeedbackSource)}>
            <option value="in_person">In person</option>
            <option value="phone">Phone</option>
            <option value="whatsapp">WhatsApp reply</option>
          </select>
        </label>
      </div>
      <label className="block text-xs font-medium">Customer comments / decline reason
        <textarea aria-label={"Customer comment "+visit.id} className={inputClass+" mt-1"}
          maxLength={1000} rows={2} value={comment}
          onChange={e=>setComment(e.target.value)}/>
      </label>
      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" checked={confirm}
          aria-label={"Confirm received customer feedback "+visit.id}
          onChange={e=>setConfirm(e.target.checked)}/>
        Customer personally gave this response or explicitly declined to respond.
      </label>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!confirm}
          onClick={()=>capture("rated")}>Save customer rating</Button>
        <Button size="sm" variant="outline" disabled={!confirm||comment.trim().length<3}
          onClick={()=>capture("declined")}>Record feedback declined</Button>
      </div>
    </div>}
    {canFollowUp&&<div className="mt-3 space-y-2 border-t border-slate-200 pt-2">
      <p className="text-xs font-semibold">Manual WhatsApp feedback / Google review draft</p>
      <label className="block text-xs">WhatsApp recipient (country code included)
        <input aria-label={"Feedback WhatsApp number "+visit.id}
          className={inputClass+" mt-1"} value={phoneOverride}
          placeholder={customerPhone||"+91..."} maxLength={25}
          onChange={e=>setPhoneOverride(e.target.value)}/>
      </label>
      <label className="block text-xs">Official Google review link (optional)
        <input aria-label={"Google review link "+visit.id}
          className={inputClass+" mt-1"} value={reviewUrl} maxLength={500}
          onChange={e=>setReviewUrl(e.target.value)}
          placeholder="https://g.page/..."/>
      </label>
      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" checked={shareConsent}
          aria-label={"Customer WhatsApp follow-up consent "+visit.id}
          onChange={e=>setShareConsent(e.target.checked)}/>
        Customer agreed to be contacted about the completed service.
      </label>
      <Button size="sm" variant="outline" disabled={!shareConsent}
        onClick={openDraft}>Open editable WhatsApp draft</Button>
      <p className="text-xs text-slate-500">
        Opens WhatsApp only when clicked. No automatic send, delivery tracking,
        selective review solicitation, or paid message API.
      </p>
    </div>}
    {error&&<p role="alert" className="text-xs text-rose-700">{error}</p>}
  </details>;
}
