import * as React from "react";
import {can,holidayCache,holidayCalendar,phase6Store,phase9Store} from "@minarvabiz/business-logic";

/**
 * HR-005 source-only Windows/Offline holiday review. SQLite v15 holds an
 * imported local snapshot; it is NOT proof of a fresh tenant-authorized Cloud
 * rule, an entitlement or permission to replay/update a holiday.
 */
const localDate=()=>{
  const value=new Date();
  return new Date(value.getTime()-value.getTimezoneOffset()*60000)
    .toISOString().slice(0,10);
};
type Preview={
  ruleCount:number;
  days:holidayCalendar.HolidayDayReview[];
  roster:ReturnType<typeof holidayCalendar.previewRosterHolidayReview>;
  attendance:ReturnType<typeof holidayCalendar.previewAttendanceHolidayReview>;
};
export function DesktopHolidayReviewPanel(){
  const today=localDate();
  const [from,setFrom]=React.useState(today.slice(0,7)+"-01");
  const [to,setTo]=React.useState(today);
  const [branchId,setBranchId]=React.useState("");
  const [countryCode,setCountryCode]=React.useState("");
  const [preview,setPreview]=React.useState<Preview|null>(null);
  const [error,setError]=React.useState("");
  const input="rounded border bg-transparent p-2";
  const enabled=can("staff.manage");
  const branches=enabled?phase9Store.listBranches():[];

  function reset(){setPreview(null);setError("");}
  function runReview(){
    reset();
    if(!enabled){setError("Manager permission is required to review offline holidays.");return;}
    try{
      const rules=holidayCache.listHolidayCache();
      if(!rules.length){setError("No authorized holiday rules are saved in this device's SQLite snapshot. No Cloud policy is inferred.");return;}
      // validateHolidayCache is invoked by listHolidayCache's original
      // import authority; revalidate this mutable runtime boundary as well.
      const checked=holidayCache.validateHolidayCache(rules);
      const orgId=checked[0].orgId;
      if(branchId&&!branches.some(b=>b.id===branchId))
        throw Error("Selected holiday branch is not in the authorized branch list");
      const context={
        orgId,branchId:branchId||null,countryCode:countryCode||null,
      };
      const days=holidayCalendar.previewHolidayCalendar({
        rules:checked,from,to,context,
      });
      const roster=holidayCalendar.previewRosterHolidayReview({
        rules:checked,context,slots:phase6Store.listRosterSlots(from,to),
      });
      const attendance=holidayCalendar.previewAttendanceHolidayReview({
        rules:checked,context,from,to,
        attendance:phase6Store.listAttendance({from,to}),
      });
      setPreview({
        ruleCount:checked.length,days:days.filter(day=>day.holidays.length>0),
        roster,attendance,
      });
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  }

  if(!enabled)return <p role="alert">You do not have permission to review offline holiday calendars.</p>;
  return <section aria-label="Offline holiday calendar review"
    className="space-y-3 rounded border p-4">
    <h3 className="font-semibold">Offline Holiday Calendar — read-only review</h3>
    <p className="text-sm">
      Uses this device's last saved SQLite holiday snapshot only. It can be stale
      or incomplete; it does not fetch or authorize Cloud policy. Holiday pay,
      leave entitlement and attendance changes are not decided here.
    </p>
    <div className="grid gap-3 md:grid-cols-2">
      <label className="grid gap-1">Branch context
        <select className={input} value={branchId} onChange={e=>{
          setBranchId(e.target.value);reset();
        }}>
          <option value="">Organization context (no branch)</option>
          {branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1">Explicit country code (ISO alpha-2, optional)
        <input className={input} maxLength={2} value={countryCode}
          placeholder="IN" onChange={e=>{
            setCountryCode(e.target.value.toUpperCase());reset();
          }}/>
      </label>
      <label className="grid gap-1">From
        <input className={input} type="date" value={from} onChange={e=>{
          setFrom(e.target.value);reset();
        }}/>
      </label>
      <label className="grid gap-1">To (maximum 366 inclusive days)
        <input className={input} type="date" value={to} onChange={e=>{
          setTo(e.target.value);reset();
        }}/>
      </label>
    </div>
    <p className="text-xs">
      Branch-only holidays are excluded when no branch is selected.
      Country-only holidays are excluded when no matching country code is given.
    </p>
    <button className={input} type="button" onClick={runReview}>
      Review saved holiday and staff exceptions
    </button>
    {error&&<p role="alert">{error}</p>}
    {preview&&<div className="space-y-2" role="status">
      <p className="text-sm">Offline snapshot: {preview.ruleCount} configured rules;
        {" "}{preview.days.length} matching days; {preview.roster.length} roster
        {" "}and {preview.attendance.length} attendance review items.
        This is not Cloud reconciliation or an approval.</p>
      {preview.days.length>0&&<ul className="space-y-1">
        {preview.days.map(day=><li className="rounded border p-2 text-sm" key={day.date}>
          {day.date} · {day.treatment} · {day.holidays.map(h=>h.name).join(", ")}
        </li>)}
      </ul>}
      {preview.roster.length>0&&<div className="space-y-1">
        <h4 className="font-medium">Roster exceptions (read-only)</h4>
        <ul>{preview.roster.map(x=><li key={x.slotId} className="text-sm">
          {x.date} · {x.slotId} · {x.treatment}
        </li>)}</ul>
      </div>}
      {preview.attendance.length>0&&<div className="space-y-1">
        <h4 className="font-medium">Attendance exceptions (read-only)</h4>
        <ul>{preview.attendance.map(x=><li key={x.attendanceId} className="text-sm">
          {x.date} · {x.staffId} · {x.reason.replaceAll("_"," ")}
        </li>)}</ul>
      </div>}
    </div>}
  </section>;
}
