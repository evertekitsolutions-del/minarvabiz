/**
 * SVC-013 — manually sequenced, offline technician itinerary worksheet.
 * No geocoding, optimization, GPS assertion, road distance or live ETA.
 */
export const SERVICE_ROUTE_MAX_STOP_ORDER=100;
export interface ServiceRouteVisit{
  readonly id:string;
  readonly branchId:string;
  readonly staffId:string;
  readonly scheduledOn:string;
  readonly siteAddress:string;
  readonly status:"scheduled"|"arrived"|"completed"|"cancelled";
  readonly routeSequence?:number|null;
  readonly orderId:string;
}
export interface ServiceRouteDay{
  readonly key:string;readonly branchId:string;readonly staffId:string;
  readonly scheduledOn:string;readonly stops:ServiceRouteVisit[];
  readonly explicitlyOrdered:number;readonly unsequenced:number;
}
export function validateServiceRouteSequence(value:unknown):number|null{
  if(value===null)return null;
  if(typeof value!=="number"||!Number.isSafeInteger(value)||
    value<1||value>SERVICE_ROUTE_MAX_STOP_ORDER)
    throw new Error("Route stop number must be an integer from 1 to 100");
  return value;
}
function validDay(value:string):boolean{
  if(typeof value!=="string"||!/^20\d{2}-\d\d-\d\d$/.test(value))return false;
  const d=new Date(value+"T00:00:00.000Z");
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function buildServiceVisitRouteDays(visits:readonly ServiceRouteVisit[],
  scheduledDay?:string):ServiceRouteDay[]{
  if(!Array.isArray(visits)||visits.length>10000||
    (scheduledDay!==undefined&&!validDay(scheduledDay)))
    throw new Error("Invalid route planner input or date");
  const map=new Map<string,ServiceRouteVisit[]>(),ids=new Set<string>(),orders=new Set<string>();
  for(const visit of visits){
    if(!visit||typeof visit.id!=="string"||!visit.id||
      typeof visit.branchId!=="string"||!visit.branchId||
      typeof visit.staffId!=="string"||!visit.staffId||
      typeof visit.orderId!=="string"||!visit.orderId||
      typeof visit.siteAddress!=="string"||!visit.siteAddress.trim()||
      !validDay(visit.scheduledOn)||
      !["scheduled","arrived","completed","cancelled"].includes(visit.status))
      throw new Error("Invalid technician route stop");
    if(ids.has(visit.id))throw new Error("Duplicate technician route visit");
    ids.add(visit.id);
    if(visit.routeSequence!==undefined)validateServiceRouteSequence(visit.routeSequence);
    if(visit.status==="cancelled"||visit.status==="completed"||
       scheduledDay!==undefined&&scheduledDay!==visit.scheduledOn)continue;
    const key=JSON.stringify([visit.branchId,visit.staffId,visit.scheduledOn]);
    const sequence=visit.routeSequence??null;
    if(sequence!==null){
      const uniqueness=key+":"+sequence;
      if(orders.has(uniqueness))throw new Error("Duplicate technician route stop number");
      orders.add(uniqueness);
    }
    const group=map.get(key)??[];
    group.push({...visit});map.set(key,group);
  }
  const output=[...map].map(([key,list])=>{
    const [branchId,staffId,scheduledOn]=JSON.parse(key) as string[];
    list.sort((a,b)=>(a.routeSequence??101)-(b.routeSequence??101)||
      a.id.localeCompare(b.id));
    return {key,branchId,staffId,scheduledOn,stops:list,
      explicitlyOrdered:list.filter(x=>x.routeSequence!=null).length,
      unsequenced:list.filter(x=>x.routeSequence==null).length};
  });
  return output.sort((a,b)=>a.scheduledOn.localeCompare(b.scheduledOn)||
    a.staffId.localeCompare(b.staffId)||a.branchId.localeCompare(b.branchId));
}
export function googleMapsServiceStopLink(siteAddress:string):string{
  if(typeof siteAddress!=="string"||!siteAddress.trim()||siteAddress.length>500||
    /[\u0000-\u001f]/.test(siteAddress))
    throw new Error("Invalid service route site address");
  const url=new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api","1");
  url.searchParams.set("query",siteAddress.trim());
  return url.toString();
}
/** Opens the first <=8 sequential stops from the device's chosen origin. */
export function googleMapsServiceRouteLink(stops:readonly Pick<ServiceRouteVisit,"siteAddress">[]):string{
  if(!Array.isArray(stops)||stops.length===0||stops.length>8)
    throw new Error("Choose 1–8 route stops; split longer schedules");
  for(const s of stops)googleMapsServiceStopLink(s.siteAddress);
  const url=new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api","1");
  url.searchParams.set("travelmode","driving");
  url.searchParams.set("destination",stops[stops.length-1].siteAddress.trim());
  if(stops.length>1)url.searchParams.set("waypoints",
    stops.slice(0,-1).map(x=>x.siteAddress.trim()).join("|"));
  return url.toString();
}
function csvCell(s:string):string{
  return '"'+(/^\s*[=+\-@]/.test(s)?"'"+s:s).replace(/"/g,'""')+'"';
}
export function exportServiceRoutePlanCsv(days:readonly ServiceRouteDay[]):string{
  const rows=[["Scheduled day","Technician ID","Stop order","Service order ID",
    "Visit ID","Site address","Visit state"].map(csvCell).join(",")];
  for(const d of days)for(const v of d.stops){
    rows.push([d.scheduledOn,d.staffId,v.routeSequence==null?"":String(v.routeSequence),
      v.orderId,v.id,v.siteAddress,v.status].map(csvCell).join(","));
  }
  return rows.join("\r\n")+"\r\n";
}
