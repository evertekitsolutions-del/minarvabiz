import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const prev=require.extensions['.ts'];
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{
  fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,file);
let calendar;
try { calendar=require('../service-visit-calendar.ts'); }
finally { if(prev)require.extensions['.ts']=prev;else delete require.extensions['.ts']; }
const visit=(id='v1',extra={})=>({id,branchId:'b1',staffId:'s1',orderId:'o1',scheduledOn:'2026-12-31',siteAddress:'Customer site',status:'scheduled',...extra});
const scope={branchId:'b1',staffId:'s1',scheduledOn:'2026-12-31'};
const build=(visits=[visit()],selection=scope)=>calendar.exportServiceVisitCalendar(visits,selection,'2026-10-23T12:30:45.000Z');
const unfold=s=>s.replace(/\r\n[ \t]/g,'');
test('calendar exports all-day visits with exclusive next-day end and UTC stamp',()=>{
 const out=unfold(build());
 assert.match(out,/DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101/);
 assert.match(out,/DTSTAMP:20261023T123045Z/);
 assert.equal((out.match(/BEGIN:VEVENT/g)||[]).length,1);
 assert.ok(out.endsWith('END:VCALENDAR\r\n'));
 assert.match(unfold(build([visit('v1',{scheduledOn:'2028-02-29'})],{...scope,scheduledOn:'2028-02-29'})),/DTEND;VALUE=DATE:20280301/);
});
test('calendar only includes the selected branch, technician and day and excludes closed visits',()=>{
 const out=build([visit(),visit('v2',{branchId:'other',siteAddress:'SECRET B'}),visit('v3',{staffId:'other',siteAddress:'SECRET S'}),visit('v4',{scheduledOn:'2026-12-30',siteAddress:'SECRET D'}),visit('v5',{status:'cancelled'}),visit('v6',{status:'completed'})]);
 assert.equal((out.match(/BEGIN:VEVENT/g)||[]).length,1);
 assert.doesNotMatch(out,/SECRET/);
});
test('calendar UIDs are stable across schedule changes and delimiter-safe',()=>{
 const uid=s=>unfold(s).match(/^UID:(.+)$/m)[1];
 assert.equal(uid(build()),uid(build([visit('v1',{scheduledOn:'2027-01-01'})],{...scope,scheduledOn:'2027-01-01'})));
 assert.notEqual(uid(build()),uid(build([visit('v2')])));
});
test('calendar escapes multiline injection and folds Malayalam/emoji at 75 UTF-8 octets',()=>{
 const address='തിരുവനന്തപുരം 🛠️ '.repeat(12)+';one,two\\three\rBEGIN:VEVENT\nATTENDEE:malicious';
 const out=build([visit('v1',{siteAddress:address,notes:'PRIVATE NOTE',signaturePngBase64:'PRIVATE SIGNATURE'})]);
 assert.equal((out.match(/^BEGIN:VEVENT$/gm)||[]).length,1);
 assert.doesNotMatch(out,/PRIVATE NOTE|PRIVATE SIGNATURE|\r\nATTENDEE:/);
 assert.match(unfold(out),/\\;one\\,two\\\\three\\nBEGIN:VEVENT\\nATTENDEE:malicious/);
 for(const line of out.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75,line);
 assert.ok(unfold(out).includes('തിരുവനന്തപുരം 🛠️ '));
 assert.ok(!out.includes('\ufffd'));
});
test('invalid or ambiguous input never creates a calendar',()=>{
 for(const list of [[visit(),visit()], [visit('v1',{scheduledOn:'2026-02-30'})], [visit('v1',{siteAddress:'x\0y'})], [visit('v1',{siteAddress:'x'.repeat(501)})]])assert.throws(()=>build(list));
 for(const s of [{...scope,scheduledOn:undefined},{...scope,branchId:''},{...scope,staffId:''},{...scope,scheduledOn:'2026-02-30'}])assert.throws(()=>build([visit()],s));
 assert.throws(()=>build([]),/No open/);
 assert.throws(()=>calendar.exportServiceVisitCalendar([visit()],scope,'invalid'),/timestamp/);
});
test('export leaves caller-owned visits unchanged',()=>{
 const input=[visit('v2',{routeSequence:2}),visit('v1',{routeSequence:1})];
 const before=structuredClone(input);build(input);assert.deepEqual(input,before);
});
