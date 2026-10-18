import test from 'node:test';
import assert from 'node:assert/strict';
import { previewResourceAvailability } from '../resource-booking.ts';

const request=(bookings,extra={})=>({orgId:'org-a',branchId:'branch-a',resourceId:'bay1',
 startsAt:'2026-11-01T09:00:00Z',endsAt:'2026-11-01T10:00:00Z',capacity:1,bookings,...extra});
const slot=(id,start,end,extra={})=>({id,orgId:'org-a',branchId:'branch-a',resourceId:'bay1',
 startsAt:`2026-11-01T${start}:00Z`,endsAt:`2026-11-01T${end}:00Z`,status:'confirmed',...extra});

test('confirmed overlapping resource booking blocks capacity 1 and returns immutable evidence',()=>{
 const a=slot('a','09:30','10:30');
 const input=request([a]);const before=structuredClone(input);
 const output=previewResourceAvailability(input);
 assert.deepEqual(output,{available:false,peakConcurrent:2,overlappingBookingIds:['a']});
 assert.ok(Object.isFrozen(output));assert.ok(Object.isFrozen(output.overlappingBookingIds));
 assert.deepEqual(input,before);
});
test('adjacent bookings and cancelled/draft/no-show holds do not block',()=>{
 const all=[slot('before','08:00','09:00'),slot('after','10:00','11:00'),slot('cancel','09:00','10:00',{status:'cancelled'}),slot('draft','09:00','10:00',{status:'draft'}),slot('noshow','09:00','10:00',{status:'no_show'})];
 assert.deepEqual(previewResourceAvailability(request(all)),{available:true,peakConcurrent:1,overlappingBookingIds:[]});
});
test('booking capacities count peak simultaneous reservations, not total intersecting range',()=>{
 const a=slot('a','09:00','09:30'),b=slot('b','09:30','10:00');
 const result=previewResourceAvailability(request([a,b],{capacity:2}));
 assert.equal(result.available,true);assert.equal(result.peakConcurrent,2);
 assert.deepEqual(result.overlappingBookingIds,['a','b']);
 assert.equal(previewResourceAvailability(request([a,b],{capacity:1})).available,false);
});
test('booking holds and completed history count as occupancy, self editing does not',()=>{
 const all=[slot('old','09:00','10:00',{status:'held'}),slot('done','09:30','09:45',{status:'completed'})];
 assert.equal(previewResourceAvailability(request(all,{capacity:2})).peakConcurrent,3);
 assert.equal(previewResourceAvailability(request(all,{capacity:2})).available,false);
 assert.deepEqual(previewResourceAvailability(request(all,{capacity:2,bookingId:'old'})),{available:true,peakConcurrent:2,overlappingBookingIds:['done']});
});
test('cross-tenant and branch leak fail closed even for irrelevant resource',()=>{
 assert.throws(()=>previewResourceAvailability(request([slot('x','09:00','10:00',{orgId:'org-b'})])),/Booking scope mismatch/);
 assert.throws(()=>previewResourceAvailability(request([slot('x','09:00','10:00',{branchId:'branch-b',resourceId:'roomB'})])),/Booking scope mismatch/);
 assert.throws(()=>previewResourceAvailability(request([slot('x','09:00','10:00'),slot('x','10:00','11:00')])),/Duplicate booking id/);
});
test('rejects invalid timestamps, DST-ambiguous strings, calendar dates and capacities',()=>{
 for(const t of ['2026-11-01T01:30:00','2026-02-30T09:00:00Z','2026-11-01','not-a-date','2026-11-01T10:70:00Z','2026-11-01T08:00:00+14:99']){
  assert.throws(()=>previewResourceAvailability(request([],{startsAt:t})),/Invalid booking time/,t);
 }
 assert.throws(()=>previewResourceAvailability(request([],{endsAt:'2026-11-01T09:00:00Z'})),/Invalid booking interval/);
 assert.throws(()=>previewResourceAvailability(request([],{endsAt:'2026-12-15T09:00:00Z'})),/Invalid booking interval/);
 for(const capacity of [0,-1,1.1,Infinity,501])assert.throws(()=>previewResourceAvailability(request([],{capacity})),/Invalid booking capacity/);
 assert.throws(()=>previewResourceAvailability(request([],{orgId:''})),/Invalid booking scope/);
});
test('offset-aware instants compare correctly, not local wall clock strings',()=>{
 const b=slot('offset','09:00','10:00',{startsAt:'2026-11-01T14:30:00+05:30',endsAt:'2026-11-01T15:00:00+05:30'});
 assert.equal(previewResourceAvailability(request([b])).available,false);
 assert.equal(previewResourceAvailability(request([slot('other','09:00','10:00',{resourceId:'room2'})])).available,true);
});
