/** Original API adapter; no Bigcapital implementation source is incorporated.
 * File-only draft payloads. Never use this preview as financial posting authority.
 */
import type { JournalEntry } from '@minarvabiz/types';
export interface BigcapitalAccount { id: number; code: string; name: string; active: boolean; currency: string | null }
export interface BigcapitalAccountCatalog {
  schema: 'minarva.bigcapital.accounts.v1'; origin: string; organizationId: string;
  baseCurrency: string; branches: {id: number; name: string}[]; accounts: BigcapitalAccount[];
}
export interface BigcapitalPreviewOptions {
  enabled: boolean; sourceWorkspace: string; branchId: string; headquartersBranchId: string;
  targetBranchId: number; currency: string; from: string; through: string;
  catalog: BigcapitalAccountCatalog; accountMap: Record<string, number>;
}
function requireValue(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function day(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value; }
function minor(n: number) {
  requireValue(typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1e10 && Math.abs(n*100-Math.round(n*100)) < 1e-6, 'Source journals must contain exact non-negative two-decimal amounts');
  return Math.round(n*100);
}
function sum(values: number[]) { const n=values.reduce((a,b)=>a+b,0);requireValue(Number.isSafeInteger(n),'Journal total overflow');return n; }
export function parseBigcapitalCatalog(input: unknown): BigcapitalAccountCatalog {
  requireValue(input && typeof input === 'object','Invalid account catalog');
  const c=input as BigcapitalAccountCatalog;
  requireValue(c.schema==='minarva.bigcapital.accounts.v1' && typeof c.origin==='string' && typeof c.organizationId==='string' && /^[\w-]{1,100}$/.test(c.organizationId),'Catalog needs an explicit target organization');
  const u=new URL(c.origin);
  requireValue(u.origin===c.origin && u.protocol==='https:' && !u.username && !u.password,'Catalog origin must be HTTPS');
  requireValue(Array.isArray(c.accounts) && c.accounts.length>0 && c.accounts.length<=10000,'Invalid account list');
  requireValue(/^[A-Z]{3}$/.test(c.baseCurrency),'Missing target base currency');
  requireValue(Array.isArray(c.branches)&&c.branches.length>0&&c.branches.every(b=>b&&Number.isSafeInteger(b.id)&&b.id>0&&typeof b.name==='string')&&new Set(c.branches.map(b=>b.id)).size===c.branches.length,'Invalid target branches');
  const ids=new Set<number>();
  const accounts=c.accounts.map(a=>{
    requireValue(a && Number.isSafeInteger(a.id) && a.id>0 && !ids.has(a.id) && typeof a.code==='string' && typeof a.name==='string' && a.name.length<=255 && typeof a.active==='boolean' && (a.currency===null || /^[A-Z]{3}$/.test(a.currency)), 'Invalid or duplicate target account');
    ids.add(a.id);return {id:a.id,code:a.code,name:a.name,active:a.active,currency:a.currency};
  });
  return {schema:c.schema,origin:u.origin,organizationId:c.organizationId,baseCurrency:c.baseCurrency,branches:c.branches.map(b=>({id:b.id,name:b.name})),accounts};
}
export function buildBigcapitalJournalPreview(journals: readonly JournalEntry[], options: BigcapitalPreviewOptions) {
  requireValue(options.enabled===true,'Bigcapital preview is disabled');
  requireValue(/^[\w-]{1,64}$/.test(options.sourceWorkspace),'Enter a stable source workspace ID (letters, numbers, underscore, hyphen)');
  requireValue(options.branchId && options.headquartersBranchId,'Active branch and headquarters must be configured');
  requireValue(Number.isSafeInteger(options.targetBranchId) && options.targetBranchId>0,'Enter the verified Bigcapital branch ID');
  // The existing Minarva journal store is two-decimal; do not silently export OMR at two decimals.
  requireValue(['INR','AED','USD','EUR','GBP'].includes(options.currency),'This journal adapter supports INR/AED/USD/EUR/GBP only; other currency precision requires verification');
  requireValue(day(options.from)&&day(options.through)&&options.from<=options.through,'Invalid date range');
  const catalog=parseBigcapitalCatalog(options.catalog), targets=new Map(catalog.accounts.map(a=>[a.id,a]));
  requireValue(catalog.baseCurrency===options.currency,'Target base currency differs; foreign-exchange conversion is not supported');
  requireValue(catalog.branches.some(b=>b.id===options.targetBranchId),'Target branch is absent from catalog');
  requireValue(options.accountMap && typeof options.accountMap==='object' && !Array.isArray(options.accountMap),'Account mapping must be an object');
  const ids=new Set<string>();
  const selected=journals.filter(j=>(j.branchId??options.headquartersBranchId)===options.branchId && j.entryDate>=options.from && j.entryDate<=options.through && j.status!=='draft')
    .sort((a,b)=>a.entryDate.localeCompare(b.entryDate)||a.id.localeCompare(b.id));
  requireValue(selected.length>0 && selected.length<=10000,'No posted journals in the selected branch/date range, or export exceeds 10,000 journals');
  const previews=selected.map(j=>{
    requireValue((j.status==='posted'||j.status==='void') && j.id && !ids.has(j.id) && day(j.entryDate) && j.description?.trim(), 'Invalid or duplicate posted journal');ids.add(j.id);
    requireValue(Array.isArray(j.lines)&&j.lines.length>=2&&j.lines.length<=1000,'Journal needs 2–1000 lines');
    const lineIds=new Set<string>();
    const entries=j.lines.map((l,index)=>{
      requireValue(l.id&&!lineIds.has(l.id)&&l.journalEntryId===j.id,'Invalid or duplicate journal line identity');lineIds.add(l.id);
      const debit=minor(l.debit),credit=minor(l.credit);
      requireValue((debit>0)!==(credit>0),'Each line must have one non-zero side');
      const target=Object.hasOwn(options.accountMap,l.accountId)?targets.get(options.accountMap[l.accountId]):undefined;
      requireValue(target?.active,'Map every source account to an active target account');
      requireValue(!target.currency||target.currency===options.currency,'Target account currency differs from source');
      return {index:index+1,account_id:target.id,debit:debit/100,credit:credit/100,note:l.memo??'',branch_id:options.targetBranchId};
    });
    const debit=sum(entries.map(e=>minor(e.debit))),credit=sum(entries.map(e=>minor(e.credit)));
    requireValue(debit>0&&debit===credit&&debit===minor(j.totalDebit)&&credit===minor(j.totalCredit),'Journal totals do not reconcile');
    const reference=`MBZ:${options.sourceWorkspace}:${options.branchId}:${j.id}`;
    requireValue(reference.length<=255,'Source reference exceeds Bigcapital limit');
    return {sourceJournalId:j.id,sourceJournalNumber:j.journalNumber,sourceVersion:j.version,sourceStatus:j.status,
      debitMinor:debit,creditMinor:credit,
      payload:{date:j.entryDate,currency_code:options.currency,exchange_rate:1,reference,description:j.description,branch_id:options.targetBranchId,publish:false,entries}};
  });
  return {schema:'minarva.bigcapital.journal-preview.v1' as const,mode:'review-only' as const,
    source:{workspace:options.sourceWorkspace,branchId:options.branchId,from:options.from,through:options.through,currency:options.currency},
    target:{origin:catalog.origin,organizationId:catalog.organizationId,branchId:options.targetBranchId},
    journalCount:previews.length,debitMinor:sum(previews.map(p=>p.debitMinor)),creditMinor:sum(previews.map(p=>p.creditMinor)),
    warnings:['No transactions have been sent. Verify target base currency matches source; no FX conversion is performed.','Void originals and dated reversals are included as ledger movements. Never publish only one side of a reversal history.','Stable references are reconciliation identifiers, not remote idempotency guarantees.'],journals:previews};
}
