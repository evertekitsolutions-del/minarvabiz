"use client";
import * as React from "react";
import {holidayCalendar,holidayCache,holidaySyncReview,phase6Store} from "@minarvabiz/business-logic";
import {holidayManagementEnabled,onlineHolidayManager} from "@/lib/holiday-online";
import {validateHolidayEdit,type HolidayEdit} from "@/lib/holiday-client";

const blank=():HolidayEdit=>({
 id:"",scope:"organization",countryCode:null,branchId:null,
 date:"",repeatsAnnually:false,name:"",treatment:"informational",
 active:true,expectedVersion:0
});
type HolidayRule=holidayCalendar.HolidayRule;
type DayReview=holidayCalendar.HolidayDayReview;
export function RosterHolidayCalendar({branches}:{branches:ReadonlyArray<{id:string;name:string}>}) {
 const [rows,setRows]=React.useState<HolidayRule[]>([]);
 const [orgId,setOrgId]=React.useState("");
 const [form,setForm]=React.useState<HolidayEdit>(blank);
 const [country,setCountry]=React.useState("");
 const [branch,setBranch]=React.useState("");
 const [from,setFrom]=React.useState("");
 const [to,setTo]=React.useState("");
 const [days,setDays]=React.useState<DayReview[]>([]);
 const [exceptions,setExceptions]=React.useState<
   ReturnType<typeof holidayCalendar.previewRosterHolidayReview>>([]);
 const [attendanceReview,setAttendanceReview]=React.useState<
   ReturnType<typeof holidayCalendar.previewAttendanceHolidayReview>>([]);
 const [syncReview,setSyncReview]=React.useState<holidaySyncReview.HolidayRevisionReview[]>([]);
 const [syncImpacts,setSyncImpacts]=React.useState<holidaySyncReview.HolidayCalendarImpact[]>([]);
 const [staffImpacts,setStaffImpacts]=React.useState<holidaySyncReview.HolidayStaffImpact[]>([]);
 const [impactReviewed,setImpactReviewed]=React.useState(false);
 const [syncReviewed,setSyncReviewed]=React.useState(false);
 const [busy,setBusy]=React.useState(false);
 const [loaded,setLoaded]=React.useState(false);
 const [error,setError]=React.useState("");
 const [message,setMessage]=React.useState("");
 const alive=React.useRef(true),inFlight=React.useRef(false);
 React.useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const input="rounded border bg-transparent p-2";
 const clearPreview=()=>{setDays([]);setExceptions([]);setAttendanceReview([]);setSyncReview([]);setSyncReviewed(false);setSyncImpacts([]);setStaffImpacts([]);setImpactReviewed(false)};
 async function load(){
   if(inFlight.current||!holidayManagementEnabled)return;
   inFlight.current=true;setBusy(true);setError("");setMessage("");
   setLoaded(false);setRows([]);setOrgId("");setForm(blank());clearPreview();
   try {
     const result=await onlineHolidayManager().list();
     if(!alive.current)return;
     setOrgId(result.orgId);setRows(result.rules);setLoaded(true);
     setMessage("Authorized organization holiday rules loaded. No attendance or roster changes were made.");
   }catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e))}
   finally{inFlight.current=false;if(alive.current)setBusy(false)}
 }
 /**
  * Fresh authenticated re-read is mandatory. The local cache is a backup,
  * not authority to replay, erase or auto-merge remotely.
  */
 async function compareRevisions(){
   if(inFlight.current||!holidayManagementEnabled||!loaded||!orgId)return;
   inFlight.current=true;setBusy(true);setError("");setMessage("");
   setSyncReview([]);setSyncReviewed(false);
   try{
     const fresh=await onlineHolidayManager().list();
     if(!alive.current)return;
     if(fresh.orgId!==orgId)throw Error("Holiday organization changed. Reload before comparing.");
     const local=holidayCache.listHolidayCache();
     const findings=holidaySyncReview.reviewHolidayRevisionSnapshots({
       orgId:fresh.orgId,local,cloud:fresh.rules,
     });
     // The selected date window is OPTIONAL for the revision check, but
     // if supplied must be complete and valid before showing any impact.
     if(Boolean(from)!==Boolean(to))
       throw Error("Select both From and To for a bounded calendar impact comparison");
     const impactWindow=Boolean(from&&to);
     const impacts=impactWindow?holidaySyncReview.reviewHolidayCalendarImpact({
       orgId:fresh.orgId,local,cloud:fresh.rules,from,to,
       context:{orgId:fresh.orgId,branchId:branch||null,countryCode:country||null},
     }):[];
     const staff=impactWindow?holidaySyncReview.reviewHolidayStaffImpact({
       orgId:fresh.orgId,local,cloud:fresh.rules,from,to,
       context:{orgId:fresh.orgId,branchId:branch||null,countryCode:country||null},
       slots:phase6Store.listRosterSlots(from,to),
       attendance:phase6Store.listAttendance({from,to}),
     }):[];
     if(!alive.current)return;
     setRows(fresh.rules);
     clearPreview();
     setSyncReview(findings);
     setSyncReviewed(true);
     setSyncImpacts(impacts);
     setStaffImpacts(staff);
     setImpactReviewed(impactWindow);
     setMessage("Fresh authorized Cloud and local holiday backup revisions reviewed. No sync, deletion, payroll or attendance changes were performed.");
   }catch(e){
     if(alive.current){
       setLoaded(false);setRows([]);setOrgId("");setForm(blank());clearPreview();
       setError("Holiday comparison blocked; reload the authorized calendar. "+(e instanceof Error?e.message:String(e)));
     }
   }finally{inFlight.current=false;if(alive.current)setBusy(false)}
 }
 function edit(row:HolidayRule){
   setForm({id:row.id,scope:row.scope,countryCode:row.countryCode,branchId:row.branchId,
     date:row.date,repeatsAnnually:row.repeatsAnnually,name:row.name,
     treatment:row.treatment,active:row.active,expectedVersion:row.version});
   setMessage("Review this exact revision before updating; original holiday scope and date cannot change.");
   setError("");
 }
 function updateScope(scope:HolidayEdit["scope"]){
   setForm(p=>({...p,scope,branchId:scope==="branch"?"":null,
     countryCode:scope==="country"?"":null}));
 }
 async function save(e:React.FormEvent){
   e.preventDefault();
   if(inFlight.current||!loaded||!holidayManagementEnabled||!orgId)return;
   let input:HolidayEdit;
   try{
     // Generate an event identity only for an explicit, first-time submission.
     input={...form,id:form.id||crypto.randomUUID()};
     validateHolidayEdit(input);
   }catch(e){setError(e instanceof Error?e.message:String(e));return}
   if(!window.confirm(input.expectedVersion
      ?"Save this reviewed holiday revision? Existing attendance, rosters and payroll will NOT change."
      :"Create this holiday calendar entry? Existing attendance, rosters and payroll will NOT change."))return;
   inFlight.current=true;setBusy(true);setError("");setMessage("");
   try{
     const result=await onlineHolidayManager().save(input);
     if(!alive.current)return;
     if(!result.accepted){
       setLoaded(false);setRows([]);setOrgId("");
       setError("Holiday write refused ("+result.reason+"). Reload the authorized rules and review the current Cloud revision before trying again.");
     }else{
       setForm({...input,id:result.rule.id,expectedVersion:result.rule.version});
       setRows(prev=>[...prev.filter(row=>row.id!==result.rule.id),result.rule].sort(
         (a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id)));
       clearPreview();
       setMessage("Holiday rule saved and audited at revision "+result.rule.version+
         ". No payroll, attendance or roster status was altered.");
     }
   }catch(e){
     if(alive.current){setLoaded(false);setRows([]);setOrgId("");
       setError("Holiday write outcome unconfirmed. Reload before retrying. "+
         (e instanceof Error?e.message:String(e)));}
   }finally{inFlight.current=false;if(alive.current)setBusy(false)}
 }
 function preview(){
   setError("");setMessage("");clearPreview();
   if(!loaded||!orgId||busy)return;
   try{
     const context={orgId,branchId:branch||null,countryCode:country||null};
     const days=holidayCalendar.previewHolidayCalendar({rules:rows,from,to,context});
     const slots=phase6Store.listRosterSlots(from,to);
     const exceptions=holidayCalendar.previewRosterHolidayReview({rules:rows,context,slots});
     const attendance=phase6Store.listAttendance({from,to});
     const attendanceFindings=holidayCalendar.previewAttendanceHolidayReview({
       rules:rows,context,from,to,attendance,
     });
     setDays(days.filter(day=>day.holidays.length>0));
     setExceptions(exceptions);
     setAttendanceReview(attendanceFindings);
     setMessage("Read-only holiday, roster and attendance review completed. Findings are not payroll decisions; no existing records were changed.");
   }catch(e){setError(e instanceof Error?e.message:String(e))}
 }
 return <section aria-label="Holiday calendar management" className="space-y-4 rounded border p-4">
   <h2 className="font-semibold">Holiday calendar — organization, country and branch</h2>
   <p>Explicit manager-configured dates only. Holiday pay, statutory entitlement,
     automatic attendance marking and shift cancellation are <strong>not enabled</strong>.</p>
   {!holidayManagementEnabled?
     <p role="status">Read-only: HR-005 authenticated database rollout is not enabled.
       The reviewed production migration and Web feature flag must be verified first.</p>:
     <button type="button" className={input} disabled={busy} onClick={()=>void load()}>
       Load / reload authorized holiday rules
     </button>}
   {error&&<p role="alert">{error}</p>}
   {message&&<p role="status">{message}</p>}
   {loaded&&<div className="space-y-3">
     <h3 className="font-medium">Registered holiday rules ({rows.length})</h3>
     {rows.length===0&&<p>No authorized holiday rules yet. Create the first one below.</p>}
     <div className="space-y-2 rounded border p-3">
       <h3 className="font-medium">Offline vs Cloud holiday revisions — read-only</h3>
       <p className="text-sm">Compares this device\u0027s existing authorized holiday snapshot with a fresh tenant-scoped Cloud read. A missing entry is unverified, not proof of deletion. No automatic sync or overwrite.</p>
       <button type="button" className={input} disabled={busy} onClick={()=>void compareRevisions()}>
         Compare Cloud and Offline revisions
       </button>
       <p className="text-sm">Optionally select Branch, Country, From and To below before comparing to review which effective calendar days differ. This does not authorize Cloud-to-Windows hydration.</p>
       {syncReviewed&&<div role="status" aria-label="Holiday revision comparison results">
         <p className="text-sm">{syncReview.filter(x=>x.kind!=="identical").length} entries need review out of {syncReview.length}. Every difference needs server-authorized review before reconciliation.</p>
         <ul className="space-y-1">{syncReview.filter(x=>x.kind!=="identical").map(x=><li key={x.ruleId} className="rounded border p-2 text-sm">
           {x.ruleId} · {x.kind.replaceAll("_"," ")} · Offline v{x.localVersion??"unknown"} · Cloud v{x.cloudVersion??"unknown"}
         </li>)}</ul>
       </div>}
       {impactReviewed&&<div role="status" aria-label="Holiday effective calendar impact results">
         <p className="text-sm">{syncImpacts.length} effective calendar days differ in the selected period. A day difference is only a manager review finding, never an attendance, leave or payroll change.</p>
         <ul className="space-y-1">{syncImpacts.map(x=><li key={x.date} className="rounded border p-2 text-sm">
           {x.date} · Offline {x.localTreatment} ({x.localHolidayIds.join(", ")||"none"}) · Cloud {x.cloudTreatment} ({x.cloudHolidayIds.join(", ")||"none"})
         </li>)}</ul>
       </div>}
       {impactReviewed&&<div role="status" aria-label="Holiday staff review impact results">
         <p className="text-sm">{staffImpacts.length} existing roster or attendance review findings differ between this device and Cloud in the selected period. These are human-only previews, not employee status changes, statutory entitlements, or proof of Cloud-to-device sync.</p>
         <ul className="space-y-1">{staffImpacts.map(x=><li className="rounded border p-2 text-sm" key={x.category+":"+x.recordId}>
           {x.date} · {x.category} {x.recordId} · Offline {x.localReview||"no exception"} · Cloud {x.cloudReview||"no exception"}
           {" "}· Offline rules {x.localHolidayIds.join(", ")||"none"} · Cloud rules {x.cloudHolidayIds.join(", ")||"none"}
         </li>)}</ul>
       </div>}
     </div>
     {rows.length>0&&<ul className="space-y-2">
       {rows.map(row=><li key={row.id} className="rounded border p-2 text-sm">
         <span>{row.date}{row.repeatsAnnually?" (annually)":""} · {row.name} · {row.scope} ·
           {" "}{row.countryCode||row.branchId||"whole organization"} ·
           {" "}{row.treatment} · {row.active?"active":"inactive"} · v{row.version}</span>
         <button type="button" className={input+" ml-2"} disabled={busy}
           onClick={()=>edit(row)}>Review / edit</button>
       </li>)}
     </ul>}
     <form className="space-y-3 rounded border p-3" onSubmit={e=>void save(e)}>
       <h3 className="font-medium">{form.expectedVersion?
         "Edit existing holiday v"+form.expectedVersion:"Create a new holiday"}</h3>
       <fieldset disabled={busy} className="grid gap-3 md:grid-cols-2">
         <label className="grid gap-1">Scope
           <select className={input} disabled={form.expectedVersion>0} value={form.scope}
             onChange={e=>updateScope(e.target.value as HolidayEdit["scope"])}>
             <option value="organization">Whole organization</option>
             <option value="country">Country (explicit ISO code)</option>
             <option value="branch">Branch</option>
           </select></label>
         {form.scope==="country"&&<label className="grid gap-1">Country code (ISO 3166-1 alpha-2)
           <input required className={input} placeholder="IN" maxLength={2} disabled={form.expectedVersion>0}
             value={form.countryCode||""} onChange={e=>setForm(p=>({...p,countryCode:e.target.value.toUpperCase()}))}/>
         </label>}
         {form.scope==="branch"&&<label className="grid gap-1">Branch
           <select required className={input} disabled={form.expectedVersion>0} value={form.branchId||""}
             onChange={e=>setForm(p=>({...p,branchId:e.target.value}))}>
             <option value="">Select branch</option>{branches.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
           </select></label>}
         <label className="grid gap-1">Holiday name
           <input className={input} required maxLength={120} value={form.name}
             onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></label>
         <label className="grid gap-1">Holiday date (branch-local)
           <input type="date" required min="1900-01-01" max="9999-12-31" className={input}
             disabled={form.expectedVersion>0} value={form.date}
             onChange={e=>setForm(p=>({...p,date:e.target.value}))}/></label>
         <label className="flex items-center gap-2"><input type="checkbox" checked={form.repeatsAnnually}
           disabled={form.expectedVersion>0} onChange={e=>setForm(p=>({...p,repeatsAnnually:e.target.checked}))}/>
           Repeat every year on this calendar date (leap days only occur in leap years)
         </label>
         <label className="grid gap-1">Treatment
           <select className={input} value={form.treatment}
             onChange={e=>setForm(p=>({...p,treatment:e.target.value as HolidayEdit["treatment"]}))}>
             <option value="informational">Informational only</option>
             <option value="non_working">Non-working (planning review)</option>
           </select></label>
         <label className="flex items-center gap-2"><input type="checkbox" checked={form.active}
           onChange={e=>setForm(p=>({...p,active:e.target.checked}))}/>Active rule</label>
         <div className="flex flex-wrap gap-2">
           <button type="submit" className={input}>Save audited holiday rule</button>
           <button type="button" className={input} onClick={()=>{setForm(blank());setError("");setMessage("")}}>
             New holiday
           </button>
         </div>
       </fieldset>
       <p className="text-sm">To correct a historical date, create a replacement rule and deactivate the old rule.
         A server-audited revision is required for every change.</p>
     </form>
     <div className="space-y-3 rounded border p-3">
       <h3 className="font-medium">Read-only calendar and roster conflict preview</h3>
       <div className="grid gap-2 md:grid-cols-2">
         <label className="grid gap-1">Branch
           <select className={input} value={branch} onChange={e=>{setBranch(e.target.value);clearPreview()}}>
             <option value="">Organization-wide, no branch</option>
             {branches.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
           </select></label>
         <label className="grid gap-1">Country context (optional)
           <input className={input} maxLength={2} placeholder="IN" value={country}
             onChange={e=>{setCountry(e.target.value.toUpperCase());clearPreview()}}/></label>
         <label className="grid gap-1">From
           <input type="date" className={input} value={from} onChange={e=>{setFrom(e.target.value);clearPreview()}}/></label>
         <label className="grid gap-1">To (up to 366 days)
           <input type="date" className={input} value={to} onChange={e=>{setTo(e.target.value);clearPreview()}}/></label>
       </div>
       <button type="button" disabled={busy} className={input} onClick={preview}>
         Preview holidays, roster and attendance exceptions
       </button>
       {days.length>0&&<ul className="space-y-1">{days.map(day=><li key={day.date}
         className="rounded border p-2 text-sm">{day.date} · {day.treatment} ·
         {" "}{day.holidays.map(x=>x.name).join(", ")}
       </li>)}</ul>}
       {attendanceReview.length>0&&<div role="status" aria-label="Attendance holiday review findings">
         <h4 className="font-medium">Attendance records requiring manager review ({attendanceReview.length})</h4>
         <p className="text-sm">These are review indicators only. Company holidays do not automatically determine leave, attendance status or payroll.</p>
         <ul className="space-y-1">{attendanceReview.map(item=><li className="rounded border p-2 text-sm" key={item.attendanceId}>
           {item.date} · staff {item.staffId} · recorded {item.status} · {item.reason.replaceAll("_"," ")}
           {item.holidayIds.length>0&&<> · configured rules {item.holidayIds.join(", ")}</>}
         </li>)}</ul>
       </div>}
       {exceptions.length>0&&<div role="status">
         <h4 className="font-medium">Roster assignments needing review ({exceptions.length})</h4>
         <ul>{exceptions.map(x=><li key={x.slotId}>{x.date} · roster {x.slotId} · {x.treatment}</li>)}</ul>
       </div>}
     </div>
   </div>}
 </section>;
}
