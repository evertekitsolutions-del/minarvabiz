import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewEmployeeOvertime } from '../workforce-overtime-review.ts';

const entry = (id, workDate, workedMinutes, status='approved', extra={}) =>
  ({ id, orgId:'org1', companyId:'co1', branchId:'b1', employeeId:'emp1',
     workDate, workedMinutes, status, ...extra });
const request = (entries, extra={}) => ({
  orgId:'org1', companyId:'co1', branchId:'b1', employeeId:'emp1',
  periodStart:'2026-11-01', periodEnd:'2026-11-30',
  standardMinutesPerDay:480, maximumOvertimeMinutesPerDay:180,
  canViewWorkforce:true, entries, ...extra
});

test('counts approved excess only and caps by configured daily policy', () => {
  const rows=[entry('a','2026-11-02',600),entry('b','2026-11-03',720),
    entry('c','2026-11-04',450),entry('d','2026-11-05',600,'pending'),
    entry('e','2026-11-05',550,'rejected')];
  const snapshot=structuredClone(rows);
  const result=reviewEmployeeOvertime(request(rows));
  assert.equal(result.approvedOvertimeMinutes,300);
  assert.equal(result.pendingEntryCount,1);
  assert.deepEqual(result.days.map(d=>d.eligibleOvertimeMinutes),[120,180,0,0]);
  assert.deepEqual(rows,snapshot);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.days));
  assert.ok(Object.isFrozen(result.days[0]));
});
test('combines multiple approved shifts and orders by civil date',()=>{
  const result=reviewEmployeeOvertime(request([
    entry('b','2026-11-09',300),entry('a','2026-11-09',300),
    entry('c','2026-11-01',490)
  ]));
  assert.deepEqual(result.days.map(d=>d.workDate),['2026-11-01','2026-11-09']);
  assert.equal(result.approvedOvertimeMinutes,130);
});
test('does not include outside-period rows or cancelled time',()=>{
  const result=reviewEmployeeOvertime(request([
    entry('old','2026-10-31',1000),entry('cancel','2026-11-02',1000,'cancelled')
  ]));
  assert.equal(result.approvedOvertimeMinutes,0);
  assert.equal(result.pendingEntryCount,0);
});
test('rejects mixed tenant, company, branch and employee scopes',()=>{
  for (const changed of [{orgId:'other'},{companyId:'other'},{branchId:'other'},{employeeId:'other'}]) {
    assert.throws(()=>reviewEmployeeOvertime(request([entry('a','2026-11-02',600,'approved',changed)])),/scope mismatch/);
  }
  assert.throws(()=>reviewEmployeeOvertime(request([], {canViewWorkforce:false})),/permission required/);
});
test('rejects duplicate ids, invalid statuses, minutes, calendar and policy',()=>{
  const a=entry('a','2026-11-02',600);
  assert.throws(()=>reviewEmployeeOvertime(request([a,a])),/Duplicate/);
  assert.throws(()=>reviewEmployeeOvertime(request([entry('a','2026-11-02',600,'unknown')])),/Invalid overtime entry/);
  for(const value of [-1,1.5,Infinity,1441]) {
    assert.throws(()=>reviewEmployeeOvertime(request([entry('a','2026-11-02',value)])),/Invalid overtime entry/);
  }
  assert.throws(()=>reviewEmployeeOvertime(request([entry('a','2026-02-30',500)])),/calendar date/);
  assert.throws(()=>reviewEmployeeOvertime(request([], {periodStart:'2026-11-31'})),/calendar date/);
  assert.throws(()=>reviewEmployeeOvertime(request([], {periodEnd:'2026-10-31'})),/period/);
  assert.throws(()=>reviewEmployeeOvertime(request([], {standardMinutesPerDay:0})),/policy/);
  assert.throws(()=>reviewEmployeeOvertime(request([], {maximumOvertimeMinutesPerDay:1441})),/policy/);
});
test('fails closed when multiple rows exceed a day of physical work',()=>{
  assert.throws(()=>reviewEmployeeOvertime(request([
    entry('a','2026-11-02',1000),entry('b','2026-11-02',500)
  ])),/exceeds 24 hours/);
});
