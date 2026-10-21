/**
 * FIN-020 — single-account budget vs actual preview.
 * Original bookkeeping logic inspired by common ERPNext/Odoo budgets.
 * No upstream source code, new runtime dependency or ledger write.
 */
import type { AccountingAccount, JournalEntry } from "@minarvabiz/types";

export interface AccountBudgetInput {
  readonly accountId: string;
  readonly periodFrom: string;
  readonly periodTo: string;
  /** Manually entered currency amount. Same reporting currency as ledger. */
  readonly budgetAmount: string;
}
export interface AccountBudgetVariance {
  readonly accountId: string;
  readonly accountCode: string;
  readonly accountName: string;
  readonly type: "income" | "expense";
  readonly from: string;
  readonly to: string;
  readonly budget: number;
  readonly actual: number;
  readonly variance: number;
  readonly favorable: boolean;
  readonly utilizationPercent: number | null;
  readonly matchedJournalCount: number;
  readonly csv: string;
}

function cents(value: string | number, label: string): number {
  const raw = typeof value === "string" ? value.trim() : String(value);
  if (!/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(raw)) {
    throw new Error(label + " must be a nonnegative two-decimal amount");
  }
  const [whole, fraction=""] = raw.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2,"0"));
  if (!Number.isSafeInteger(minor)) throw new Error(label + " exceeds safe monetary range");
  return minor;
}
function validDate(s:string):string {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(s)) throw new Error("Budget dates must be YYYY-MM-DD");
  const d = new Date(s + "T00:00:00Z");
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10)!==s) {
    throw new Error("Invalid budget calendar date");
  }
  return s;
}
function add(a:number,b:number):number {
  const x=a+b;
  if (!Number.isSafeInteger(x)) throw new Error("Budget actual totals exceed safe range");
  return x;
}
function csvCell(value:string|number):string {
  const str=String(value);
  const safe=/^[\s\uFEFF]*[=+\-@\t\r]/u.test(str)?"'"+str:str;
  return '"'+safe.replace(/"/g,'""')+'"';
}
/**
 * Posted and voided-with-posted-reversal journal pairs are both included,
 * matching the established general-ledger reportable-entry policy.
 * Only the host-provided scoped account and branch are accepted.
 * Reversal entries must stay in the same accounting period as recorded.
 */
export function buildAccountBudgetVariance(
  input: AccountBudgetInput,
  accounts: readonly AccountingAccount[],
  journalEntries: readonly JournalEntry[],
  branchId: string | null,
): AccountBudgetVariance {
  const from=validDate(input.periodFrom),to=validDate(input.periodTo);
  if (from>to) throw new Error("Budget date range ends before it starts");
  const target=accounts.find(a=>a.id===input.accountId && !a.deletedAt &&
    (a.branchId==null||a.branchId===branchId));
  if (!target || !["income","expense"].includes(target.type)) {
    throw new Error("Select an authorized income or expense account");
  }
  const budgetMinor=cents(input.budgetAmount,"Budget");
  let actualMinor=0, matchedJournalCount=0;
  const seen=new Set<string>();
  for(const entry of journalEntries){
    if (!["posted","void"].includes(entry.status) ||
      (entry.branchId!=null && entry.branchId!==branchId) ||
      entry.entryDate<from || entry.entryDate>to) continue;
    if (seen.has(entry.id)) throw new Error("Duplicate posted journal ID");
    seen.add(entry.id);
    let accounted=false;
    for(const line of entry.lines) {
      if(line.accountId!==target.id)continue;
      const debitMinor=cents(line.debit,"Posted debit"),creditMinor=cents(line.credit,"Posted credit");
      const signed=target.type==="income" ? creditMinor-debitMinor : debitMinor-creditMinor;
      actualMinor=add(actualMinor,signed);
      accounted=true;
    }
    if(accounted)matchedJournalCount++;
  }
  const varianceMinor=actualMinor-budgetMinor;
  const type=target.type as "income"|"expense";
  const favorable=type==="expense"?varianceMinor<=0:varianceMinor>=0;
  const utilizationPercent=budgetMinor>0? Math.round(actualMinor/budgetMinor*1000)/10:null;
  const csv=[["Account code","Account","Category","Period from","Period to",
    "Budget","Actual posted","Variance (actual - budget)","Favorable","Actual as percent of budget","Matching journals"],
    [target.code,target.name,type,from,to,(budgetMinor/100).toFixed(2),
    (actualMinor/100).toFixed(2),(varianceMinor/100).toFixed(2),
    favorable?"yes":"no",utilizationPercent==null?"":String(utilizationPercent),String(matchedJournalCount)],
  ].map(line=>line.map(csvCell).join(",")).join("\r\n")+"\r\n";
  return {
    accountId:target.id,accountCode:target.code,accountName:target.name,
    type,from,to,budget:budgetMinor/100,actual:actualMinor/100,
    variance:varianceMinor/100,favorable,utilizationPercent,matchedJournalCount,csv,
  };
}
