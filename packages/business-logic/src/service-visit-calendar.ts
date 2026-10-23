import {buildServiceVisitRouteDays,type ServiceRouteVisit} from "./service-visit-route-planner";
import formatText from "./vendor/ics/format-text";

export interface ServiceCalendarSelection {
  readonly branchId:string;
  readonly staffId:string;
  readonly scheduledOn:string;
}
const encoder=new TextEncoder();
/** RFC 5545 folding counts UTF-8 octets, including the continuation space. */
function foldLine(line:string):string {
  const parts:string[]=[];
  let part="",length=0;
  for(const character of line){
    const bytes=encoder.encode(character).length;
    if(length+bytes>75){parts.push(part);part=" ";length=1;}
    part+=character;length+=bytes;
  }
  parts.push(part);
  return parts.join("\r\n");
}
function validText(value:unknown,max:number):value is string {
  return typeof value==="string"&&value.trim().length>0&&value.length<=max&&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)&&
    !/[\uD800-\uDFFF]/u.test(value);
}
/**
 * Read-only snapshot of ONE technician/day from already authorized visits.
 * Callers must re-read through listServiceSiteVisits at export time. This pure
 * serializer does not grant access, send invitations or synchronize calendars.
 */
export function exportServiceVisitCalendar(
  visits:readonly ServiceRouteVisit[],selection:ServiceCalendarSelection,generatedAt:string,
):string {
  if(!selection||!validText(selection.branchId,200)||!validText(selection.staffId,200)||
    typeof selection.scheduledOn!=="string"||!/^20\d{2}-\d{2}-\d{2}$/.test(selection.scheduledOn))
    throw new Error("Invalid calendar selection");
  if(typeof generatedAt!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(generatedAt)||
    !Number.isFinite(Date.parse(generatedAt))||new Date(generatedAt).toISOString()!==generatedAt)
    throw new Error("Invalid calendar timestamp");
  const days=buildServiceVisitRouteDays(visits,selection.scheduledOn);
  const day=days.find(d=>d.branchId===selection.branchId&&d.staffId===selection.staffId);
  if(!day)throw new Error("No open visits for this technician and day");
  const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Minarva Biz//Service Visits//EN",
    "CALSCALE:GREGORIAN"];
  const stamp=generatedAt.replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
  for(const visit of day.stops){
    if(!validText(visit.id,200)||!validText(visit.orderId,200)||!validText(visit.siteAddress,500))
      throw new Error("Invalid calendar visit text");
    const end=new Date(visit.scheduledOn+"T00:00:00.000Z");
    end.setUTCDate(end.getUTCDate()+1);
    // JSON tuple prevents delimiter collisions; encoding forbids property injection.
    const uid=encodeURIComponent(JSON.stringify([visit.branchId,visit.id]))+"@minarvabiz";
    lines.push("BEGIN:VEVENT","UID:"+uid,"DTSTAMP:"+stamp,
      "DTSTART;VALUE=DATE:"+visit.scheduledOn.replace(/-/g,""),
      "DTEND;VALUE=DATE:"+end.toISOString().slice(0,10).replace(/-/g,""),
      "SUMMARY:"+formatText("Service visit — "+visit.orderId),
      "LOCATION:"+formatText(visit.siteAddress),
      "DESCRIPTION:"+formatText("Technician: "+visit.staffId+"\nVisit: "+visit.id+
        "\nStatus: "+visit.status+"\nCalendar snapshot; check Minarva Biz for changes."),
      "CLASS:PRIVATE","TRANSP:TRANSPARENT","END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n")+"\r\n";
}
