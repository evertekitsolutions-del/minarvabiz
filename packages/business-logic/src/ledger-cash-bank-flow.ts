/**
 * FIN-013 — posted-journal consolidated cash + bank movement report.
 * Transfers between the two configured liquid accounts have zero group net
 * impact, and therefore do not inflate the gross inflows/outflows.
 *
 * This is a CASH/BANK MOVEMENT vertical cut, not a complete statutory cash
 * flow statement (operating / investing / financing classification requires
 * reviewed source categorisation and all custom cash equivalents).
 */
import type { AccountingAccount, JournalEntry } from "@minarvabiz/types";
import {
  addMinorUnits, subtractMinorUnits, toMinorUnits, fromMinorUnits,
} from "@minarvabiz/utils";
import { listAccounts,listJournalEntries } from "./accounting-store";
import { assertPermission } from "./permissions";
import { getActiveBranch } from "./phase9-store";

export interface CashBankJournalMovement {
  journalEntryId:string;
  journalNumber:string;
  date:string;
  description:string;
  cashChange:number;
  bankChange:number;
  netCashFlow:number;
}
export interface CashBankFlowReport {
  from:string|null;to:string|null;
  openingCash:number;openingBank:number;openingTotal:number;
  cashInflows:number;cashOutflows:number;netFlow:number;
  closingCash:number;closingBank:number;closingTotal:number;
  movements:CashBankJournalMovement[];
}
function dayKey(input?:string):string|null {
 if(input===undefined||input==="")return null;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input))throw new Error("Invalid cash-flow date");
 const d=new Date(input+"T00:00:00Z");
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==input){
   throw new Error("Invalid cash-flow date");
 }
 return input;
}

/** Pure, pre-scoped, exact-minor aggregation over posted accounting journals. */
export function calculatePostedCashBankFlow(
 accounts:readonly AccountingAccount[],journals:readonly JournalEntry[],
 from?:string,to?:string,
):CashBankFlowReport {
 const start=dayKey(from),end=dayKey(to);
 if(start&&end&&start>end)throw new Error("Cash-flow start date exceeds end date");
 const liquids=new Map(accounts.filter(a=>!a.deletedAt &&
   (a.systemKey==="cash"||a.systemKey==="bank")).map(a=>[a.id,a.systemKey]));
 let openingCash=0,openingBank=0,periodCash=0,periodBank=0,ins=0,outs=0;
 const movements:CashBankJournalMovement[]=[];
 for(const journal of journals){
  if(!["posted","void"].includes(journal.status))continue;
  const date=typeof journal.entryDate==="string"?journal.entryDate.slice(0,10):"";
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error("Posted cash-flow journal has invalid date");
  if(end&&date>end)continue;
  let cash=0,bank=0,debits=0,credits=0;
  for(const line of journal.lines){
    const debit=toMinorUnits(line.debit),credit=toMinorUnits(line.credit);
    if(debit<0||credit<0||debit>0&&credit>0)throw new Error("Invalid posted cash-flow journal line");
    debits=addMinorUnits(debits,debit);
    credits=addMinorUnits(credits,credit);
    const net=subtractMinorUnits(debit,credit);
    const kind=liquids.get(line.accountId);
    if(kind==="cash")cash=addMinorUnits(cash,net);
    if(kind==="bank")bank=addMinorUnits(bank,net);
  }
  if(debits!==credits ||
     debits!==toMinorUnits(journal.totalDebit) ||
     credits!==toMinorUnits(journal.totalCredit)){
    throw new Error("Posted cash-flow journal totals are not balanced");
  }
  if(start&&date<start){
    openingCash=addMinorUnits(openingCash,cash);
    openingBank=addMinorUnits(openingBank,bank);
    continue;
  }
  periodCash=addMinorUnits(periodCash,cash);
  periodBank=addMinorUnits(periodBank,bank);
  const net=addMinorUnits(cash,bank);
  // Internal transfers between cash and bank have net zero. Do not add to
  // external cash inflows or outflows or create misleading zero-movement rows.
  if(net>0)ins=addMinorUnits(ins,net);
  if(net<0)outs=addMinorUnits(outs,-net);
  if(cash||bank)movements.push({
    journalEntryId:journal.id,journalNumber:journal.journalNumber,
    date,description:journal.description,
    cashChange:fromMinorUnits(cash),bankChange:fromMinorUnits(bank),
    netCashFlow:fromMinorUnits(net),
  });
 }
 movements.sort((a,b)=>b.date.localeCompare(a.date)||
   b.journalNumber.localeCompare(a.journalNumber)||b.journalEntryId.localeCompare(a.journalEntryId));
 const closingCash=addMinorUnits(openingCash,periodCash);
 const closingBank=addMinorUnits(openingBank,periodBank);
 return {
  from:start,to:end,
  openingCash:fromMinorUnits(openingCash),openingBank:fromMinorUnits(openingBank),
  openingTotal:fromMinorUnits(addMinorUnits(openingCash,openingBank)),
  cashInflows:fromMinorUnits(ins),cashOutflows:fromMinorUnits(outs),
  netFlow:fromMinorUnits(subtractMinorUnits(ins,outs)),
  closingCash:fromMinorUnits(closingCash),closingBank:fromMinorUnits(closingBank),
  closingTotal:fromMinorUnits(addMinorUnits(closingCash,closingBank)),
  movements,
 };
}

/** Resolve user permission and active-branch scope in domain code. */
export function buildAuthorizedCashBankFlow(from?:string,to?:string):CashBankFlowReport {
 assertPermission("accounting.view");
 const branch=getActiveBranch();
 const sameBranch=<T extends{branchId?:string|null}>(x:T)=>
   x.branchId==null||(branch!=null&&x.branchId===branch.id);
 return calculatePostedCashBankFlow(
  listAccounts(true).filter(sameBranch),listJournalEntries().filter(sameBranch),from,to);
}
