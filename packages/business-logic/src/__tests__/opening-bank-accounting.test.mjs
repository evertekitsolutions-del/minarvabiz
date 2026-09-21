import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url), ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const opening=require('../opening-balances.ts'), accounting=require('../accounting-store.ts'), outbox=require('../outbox-bridge.ts'), permissions=require('../permissions.ts');
permissions.setCurrentRole('admin'); permissions.setRuntimeFeaturePolicy(null);
const chart=accounting.exportAccountingState().accounts;
function reset(accounts=chart){accounting.hydrateAccountingState({accounts,journals:[],journalSequence:0});outbox.hydrateOutbox([]);}
const balance=key=>{const a=accounting.getSystemAccount(key);const row=accounting.buildTrialBalance().find(r=>r.accountId===a?.id);return Math.round(((row?.debit??0)-(row?.credit??0))*100)/100;};
const snapshot=()=>JSON.stringify({accounting:accounting.exportAccountingState(),outbox:outbox.exportOutbox()});

reset();
assert.deepEqual(opening.setOpeningBank(500.25),{ok:true});
assert.equal(balance('bank'),500.25); assert.equal(balance('opening_balance_equity'),-500.25);
assert(accounting.buildBalanceSheet().balanced);
const journal=accounting.listJournalEntries().find(j=>j.referenceType==='auto_opening_bank');
assert(journal); assert.equal(journal.referenceId,'opening-bank'); assert.equal(journal.entryDate,new Date().toISOString().slice(0,10));
assert(accounting.voidJournalEntry(journal.id).errors.length);
for(const type of ['accounts','journal_entries','journal_entry_lines']) assert(outbox.listPendingOutbox().some(e=>e.aggregateType===type),type);
const after=snapshot();
assert.match(opening.setOpeningBank(500.25).error,/already been posted/i); assert.equal(snapshot(),after);
assert.match(opening.setOpeningBank(700).error,/already been posted/i); assert.equal(snapshot(),after);

reset(); const before=snapshot();
for(const amount of [0,NaN,Infinity,-Infinity,-1,1e30]){assert(opening.setOpeningBank(amount).error);assert.equal(snapshot(),before);}

reset();
let operational=accounting.planAutomaticPosting({referenceType:'auto_direct_purchase',referenceId:'bank-activity',date:new Date().toISOString(),description:'Prior bank activity',lines:[
  {key:'unclassified_purchases',debit:25},{key:'bank',credit:25},
]});
assert.deepEqual(operational.errors,[]); operational.commit();
const active=snapshot();
assert.match(opening.setOpeningBank(100).error,/already has accounting activity/i); assert.equal(snapshot(),active);

reset(chart.map(a=>a.systemKey==='bank'?{...a,isActive:false}:a));
const blockedBank=snapshot(); assert(opening.setOpeningBank(10).error); assert.equal(snapshot(),blockedBank);
reset(chart.map(a=>a.systemKey==='opening_balance_equity'?{...a,isActive:false}:a));
const blockedEquity=snapshot(); assert(opening.setOpeningBank(10).error); assert.equal(snapshot(),blockedEquity);

reset(); permissions.setCurrentRole('cashier'); assert.throws(()=>opening.setOpeningBank(10),/denied/i); permissions.setCurrentRole('admin');

console.log('Opening bank accounting: one-time bank/equity posting, prior-activity guard, validation, immutable journal, permissions and outbox PASS');
