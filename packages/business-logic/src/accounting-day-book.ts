/**
 * FIN-017 — journal Day Book: all posted/void accounting entries dated
 * within the selected period, ordered by date and journal number.
 * A posted voided original and separately posted reversal appear as distinct
 * accounting events; the report is not an income/expense classifier.
 */
import type { JournalEntry } from "@minarvabiz/types";
import { addMinorUnits, fromMinorUnits, toMinorUnits } from "@minarvabiz/utils";
import { listJournalEntries } from "./accounting-store";
import { assertPermission } from "./permissions";
import { getActiveBranch } from "./phase9-store";

export interface AccountingDayBookRow {
  readonly journalEntryId:string;
  readonly journalNumber:string;
  readonly entryDate:string;
  readonly description:string;
  readonly status:"posted"|"void";
  readonly totalDebit:number;
  readonly totalCredit:number;
  readonly accountBreakdown:string;
}
export interface AccountingDayBookDailyTotal {
  readonly date:string;
  readonly journalCount:number;
  readonly debit:number;
  readonly credit:number;
}
export interface AccountingDayBookReport {
  readonly from:string|null;
  readonly to:string|null;
  readonly journalCount:number;
  readonly totalDebit:number;
  readonly totalCredit:number;
  readonly daily:AccountingDayBookDailyTotal[];
  readonly journals:AccountingDayBookRow[];
}
function canonicalDay(value:string|undefined):string|null {
 if(value===undefined||value==="")return null;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error("Invalid day-book date");
 const d=new Date(value+"T00:00:00.000Z");
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)
   throw new Error("Invalid day-book date");
 return value;
}

/** Pure read of already-authorized local journal collection. */
export function calculateAccountingDayBook(
 entries:readonly JournalEntry[],from?:string,to?:string,
):AccountingDayBookReport {
 const start=canonicalDay(from),end=canonicalDay(to);
 if(start&&end&&start>end)throw new Error("Day-book start date exceeds end date");
 const daily=new Map<string,{count:number;debit:number;credit:number}>();
 const journalRows:AccountingDayBookRow[]=[];
 let totalDebit=0,totalCredit=0;
 for(const entry of entries){
  if(entry.status!=="posted"&&entry.status!=="void")continue;
  if(typeof entry.entryDate!=="string")throw new Error("Posted journal has no valid date");
  const date=canonicalDay(entry.entryDate.slice(0,10));
  if(!date)throw new Error("Posted journal has no valid date");
  if(start&&date<start||end&&date>end)continue;
  if(!Array.isArray(entry.lines)||entry.lines.length<2)throw new Error("Posted journal needs at least two lines");
  let debit=0,credit=0;
  const descriptions:string[]=[];
  for(const line of entry.lines){
    const dr=toMinorUnits(line.debit),cr=toMinorUnits(line.credit);
    if(dr<0||cr<0||dr>0&&cr>0||dr===0&&cr===0)throw new Error("Invalid posted journal day-book line");
    debit=addMinorUnits(debit,dr);
    credit=addMinorUnits(credit,cr);
    descriptions.push((line.accountCode||line.accountName||line.accountId)+
      (dr?" Dr "+fromMinorUnits(dr).toFixed(2):" Cr "+fromMinorUnits(cr).toFixed(2)));
  }
  if(debit!==credit||debit!==toMinorUnits(entry.totalDebit)||
    credit!==toMinorUnits(entry.totalCredit)){
    throw new Error("Day-book journal is not balanced");
  }
  const day=daily.get(date)??{count:0,debit:0,credit:0};
  day.count++;
  day.debit=addMinorUnits(day.debit,debit);
  day.credit=addMinorUnits(day.credit,credit);
  daily.set(date,day);
  totalDebit=addMinorUnits(totalDebit,debit);
  totalCredit=addMinorUnits(totalCredit,credit);
  journalRows.push({
    journalEntryId:entry.id,journalNumber:entry.journalNumber,
    entryDate:date,description:entry.description,status:entry.status,
    totalDebit:fromMinorUnits(debit),totalCredit:fromMinorUnits(credit),
    accountBreakdown:descriptions.join(" | "),
  });
 }
 journalRows.sort((a,b)=>b.entryDate.localeCompare(a.entryDate)||
   b.journalNumber.localeCompare(a.journalNumber)||
   a.journalEntryId.localeCompare(b.journalEntryId));
 return {
  from:start,to:end,journalCount:journalRows.length,
  totalDebit:fromMinorUnits(totalDebit),totalCredit:fromMinorUnits(totalCredit),
  daily:[...daily].map(([date,item])=>({
    date,journalCount:item.count,
    debit:fromMinorUnits(item.debit),credit:fromMinorUnits(item.credit),
  })).sort((a,b)=>b.date.localeCompare(a.date)),
  journals:journalRows,
 };
}
/** Applies the active local store/branch and accounting permission. */
export function buildAuthorizedAccountingDayBook(from?:string,to?:string):AccountingDayBookReport{
 assertPermission("accounting.view");
 const branch=getActiveBranch();
 return calculateAccountingDayBook(listJournalEntries().filter(e=>
   e.branchId==null||(branch!=null&&e.branchId===branch.id)),from,to);
}
