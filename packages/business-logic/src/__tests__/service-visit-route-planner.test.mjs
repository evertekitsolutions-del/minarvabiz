import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
const filename=require.resolve("../service-visit-route-planner.ts");
const prev=require.extensions[".ts"];
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(
  fs.readFileSync(file,"utf8"),{fileName:file,
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
  }).outputText,file);
let route;
try{delete require.cache[filename];route=require(filename);}
finally{if(prev)require.extensions[".ts"]=prev;else delete require.extensions[".ts"];}
const day="2026-10-24";
const example=(id="v1",overrides={})=>({
  id,branchId:"b1",staffId:"s1",scheduledOn:day,siteAddress:"Customer site "+id,
  status:"scheduled",orderId:"o"+id,routeSequence:null,...overrides,
});
test("SVC-013 route rank validation allows clearing and safe integer 1–100 only",()=>{
  assert.equal(route.validateServiceRouteSequence(1),1);
  assert.equal(route.validateServiceRouteSequence(100),100);
  assert.equal(route.validateServiceRouteSequence(null),null);
  for(const v of [undefined,0,-1,101,1.5,NaN,Infinity,"2",[],{}])
    assert.throws(()=>route.validateServiceRouteSequence(v),/Route stop/);
});
test("SVC-013 sorts numbered stops before unnumbered ones deterministically",()=>{
  const input=[example("z",{routeSequence:null}),
    example("b",{routeSequence:3}),example("a",{routeSequence:1}),
    example("y",{routeSequence:null})];
  const days=route.buildServiceVisitRouteDays(input);
  assert.equal(days.length,1);
  assert.deepEqual(days[0].stops.map(x=>x.id),["a","b","y","z"]);
  assert.deepEqual([days[0].explicitlyOrdered,days[0].unsequenced],[2,2]);
});
test("SVC-013 groups by branch staff and day, excluding closed visits",()=>{
  const days=route.buildServiceVisitRouteDays([
    example("b",{branchId:"b2"}),
    example("c",{staffId:"s2"}),
    example("d",{scheduledOn:"2026-10-25"}),
    example("e",{status:"arrived"}),
    example("f",{status:"completed"}),
    example("g",{status:"cancelled"}),
  ]);
  assert.equal(days.length,4);
  assert.equal(days.reduce((n,d)=>n+d.stops.length,0),4);
  assert.equal(route.buildServiceVisitRouteDays([
    example("x",{scheduledOn:"2026-10-25"})],day).length,0);
  assert.equal(route.buildServiceVisitRouteDays([
    example("x",{scheduledOn:"2026-10-25"})],"2026-10-25").length,1);
});
test("SVC-013 route numbers are unique within technician/date and can repeat elsewhere",()=>{
  const stops=[example("v1",{routeSequence:1}),example("v2",{routeSequence:1})];
  assert.throws(()=>route.buildServiceVisitRouteDays(stops),/Duplicate technician route stop/);
  assert.doesNotThrow(()=>route.buildServiceVisitRouteDays([
    example("v1",{routeSequence:1}),
    example("v2",{staffId:"s2",routeSequence:1}),
    example("v3",{scheduledOn:"2026-10-25",routeSequence:1}),
  ]));
});
test("SVC-013 invalid route dataset and day reject before exposing site addresses",()=>{
  for(const stops of [
    [{...example(),id:""}],[example(),example()],
    [{...example(),scheduledOn:"2026-02-30"}],
    [{...example(),siteAddress:""}],
    [{...example(),routeSequence:0}],
    [{...example(),status:"unexpected"}],
  ])assert.throws(()=>route.buildServiceVisitRouteDays(stops));
  for(const d of ["bad","2026-02-30","2026-10-24T00:00:00.000Z"])
    assert.throws(()=>route.buildServiceVisitRouteDays([],d),/date/);
});
test("SVC-013 Maps URLs contain percent-encoded operator-selected address only",()=>{
  const address="Camera Room, 2nd Floor, Kerala, India & Partners";
  const link=route.googleMapsServiceStopLink(address);
  const u=new URL(link);
  assert.equal(u.protocol,"https:");
  assert.equal(u.hostname,"www.google.com");
  assert.equal(u.pathname,"/maps/search/");
  assert.equal(u.searchParams.get("api"),"1");
  assert.equal(u.searchParams.get("query"),address);
  assert.ok(!link.includes("javascript:"));
  for(const s of [""," ","Test\nAddress","a".repeat(501)])
    assert.throws(()=>route.googleMapsServiceStopLink(s));
});
test("SVC-013 Google Maps driving itinerary follows provided manual sequence",()=>{
  const stops=[example("first"),example("second"),example("third")];
  const u=new URL(route.googleMapsServiceRouteLink(stops));
  assert.equal(u.hostname,"www.google.com");
  assert.equal(u.pathname,"/maps/dir/");
  assert.equal(u.searchParams.get("travelmode"),"driving");
  assert.equal(u.searchParams.get("destination"),"Customer site third");
  assert.equal(u.searchParams.get("waypoints"),"Customer site first|Customer site second");
  assert.equal(u.searchParams.get("origin"),null);
  assert.throws(()=>route.googleMapsServiceRouteLink([]),/1–8/);
  assert.throws(()=>route.googleMapsServiceRouteLink(Array(9).fill(stops[0])),/1–8/);
  assert.throws(()=>route.googleMapsServiceRouteLink([{siteAddress:""}]),/address/);
});
test("SVC-013 route worksheet CSV guards Excel formula injection",()=>{
  const d=route.buildServiceVisitRouteDays([example("v1",{
    siteAddress:"=HYPERLINK(\"evil\")",orderId:"-123",routeSequence:1,
  })]);
  const csv=route.exportServiceRoutePlanCsv(d);
  assert.match(csv,/"'=HYPERLINK\(""evil""\)"/);
  assert.match(csv,/"'-123"/);
  assert.match(csv,/"Stop order"/);
  assert.ok(csv.endsWith("\r\n"));
});
test("SVC-013 no hidden routing provider or geocoding in source",()=>{
  const src=fs.readFileSync(new URL("../service-visit-route-planner.ts",import.meta.url),"utf8");
  assert.doesNotMatch(src,/googleapis\.com|maps\.googleapis|fetch\(|XMLHttpRequest|navigator\.geolocation/);
  const panel=fs.readFileSync(new URL(
    "../../../ui/src/components/orders/ServiceVisitRoutePanel.tsx",import.meta.url),"utf8");
  assert.match(panel,/window\.open\(googleMapsServiceStopLink/);
  assert.match(panel,/window\.open\(googleMapsServiceRouteLink/);
  assert.match(panel,/setServiceSiteVisitRouteSequence\(/);
  const parent=fs.readFileSync(new URL(
    "../../../ui/src/components/orders/ServiceSiteVisitPanel.tsx",import.meta.url),"utf8");
  assert.match(parent,/<ServiceVisitRoutePanel visits=\{visits\}/);
});
