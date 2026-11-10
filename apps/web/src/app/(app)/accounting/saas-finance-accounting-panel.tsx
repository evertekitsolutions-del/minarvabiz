"use client";
import * as React from "react";
import {configFromEnv,pgRpc,pgSelect} from "@minarvabiz/database";
import {can,getOutboxScope,getSessionToken,getSessionUser} from "@minarvabiz/business-logic";
import {resolveOnlineAuthorization} from "../../../lib/data-source";

type Branch={id:string;name:string};
type Account={id:string;branch_id:string;kind:"cash"|"bank";name:string};
type Customer={id:string;name:string};
type Sale={id:string;invoice_number:string;customer_id:string|null;balance_amount:number;branch_id:string};
type Payable={order_id:string;supplier_id:string;total:number;paid:number};
type Entry={id:string;kind:string;amount:number;signed_delta:number;account_id:string;note:string};
type Daybook={
 sales_gross:number;sales_net:number;sales_gst_recorded:number;sales_cogs:number;
 laundry_revenue:number;tailoring_revenue:number;operating_expenses:number;
 operating_surplus_estimate:number;vendor_grn_payables_created:number;
 supplier_payments:number;customer_collections_posted:number;
 financial_statement_status:string;
 cash_bank_accounts:{id:string;name:string;kind:string;balance:number}[];
};
type Pending={id:string;body:string};
const input="min-h-[44px] w-full rounded border p-2 text-sm";
const button="min-h-[44px] rounded bg-slate-900 px-4 text-sm text-white disabled:opacity-50";
const money=(n:number)=>"₹"+Number(n||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
export function SaasFinanceAccountingPanel(){
 const [branches,setBranches]=React.useState<Branch[]>([]);
 const [accounts,setAccounts]=React.useState<Account[]>([]);
 const [customers,setCustomers]=React.useState<Customer[]>([]);
 const [sales,setSales]=React.useState<Sale[]>([]);
 const [payables,setPayables]=React.useState<Payable[]>([]);
 const [entries,setEntries]=React.useState<Entry[]>([]);
 const [daybook,setDaybook]=React.useState<Daybook|null>(null);
 const [branchId,setBranchId]=React.useState("");
 const [kind,setKind]=React.useState<"cash"|"bank">("cash");
 const [accountName,setAccountName]=React.useState("");
 const [accountId,setAccountId]=React.useState("");
 const [postingKind,setPostingKind]=React.useState<"customer_receipt"|"customer_advance"|"supplier_payment"|"expense">("customer_receipt");
 const [referenceId,setReferenceId]=React.useState("");
 const [amount,setAmount]=React.useState("");
 const [note,setNote]=React.useState("");
 const [from,setFrom]=React.useState("2026-11-01");
 const [to,setTo]=React.useState("2026-11-30");
 const [busy,setBusy]=React.useState(false);
 const [error,setError]=React.useState("");
 const [notice,setNotice]=React.useState("");
 const pendingAccount=React.useRef<Pending|null>(null);
 const pendingEntry=React.useRef<Pending|null>(null);
 const inFlight=React.useRef(false);
 async function context(){
  const c=configFromEnv(),token=getSessionToken(),user=getSessionUser();
  if(!c||!token||!user?.id)throw new Error("Cloud finance requires signed-in tenant.");
  const a=await resolveOnlineAuthorization(token,user.id);
  if(!a.ok||getOutboxScope()!==a.orgId+":"+user.id||
   !can("accounting.manage"))throw new Error("Finance administrator permission required.");
  return {cfg:{...c,accessToken:token},token,user:user.id,org:a.orgId};
 }
 function validSession(t:string,u:string){
  if(t!==getSessionToken()||u!==getSessionUser()?.id)throw new Error("Session changed during finance operation.");
 }
 const refresh=React.useCallback(async()=>{
  const a=await context();
  const [br,ac,cu,sa,pa,en]=await Promise.all([
   pgSelect<Branch>(a.cfg,"branches","select=id,name&org_id=eq."+a.org+"&is_active=eq.true&deleted_at=is.null&limit=100"),
   pgSelect<Account>(a.cfg,"saas_finance_accounts","select=id,branch_id,kind,name&org_id=eq."+a.org+"&order=created_at.desc&limit=200"),
   pgSelect<Customer>(a.cfg,"customers","select=id,name&org_id=eq."+a.org+"&deleted_at=is.null&limit=500"),
   pgSelect<Sale>(a.cfg,"sales","select=id,invoice_number,customer_id,balance_amount,branch_id&org_id=eq."+a.org+"&deleted_at=is.null&status=neq.cancelled&limit=500"),
   pgSelect<Payable>(a.cfg,"saas_supplier_payables","select=order_id,supplier_id,total,paid&org_id=eq."+a.org+"&limit=500"),
   pgSelect<Entry>(a.cfg,"saas_finance_entries","select=id,kind,amount,signed_delta,account_id,note&org_id=eq."+a.org+"&order=created_at.desc&limit=100"),
  ]);
  if(br.error||ac.error||cu.error||sa.error||pa.error||en.error||
   !br.data||!ac.data||!cu.data||!sa.data||!pa.data||!en.data)
   throw new Error(br.error?.message||ac.error?.message||cu.error?.message||
    sa.error?.message||pa.error?.message||en.error?.message||"Cloud finance data unavailable.");
  validSession(a.token,a.user);
  setBranches(br.data);setAccounts(ac.data);setCustomers(cu.data);
  setSales(sa.data);setPayables(pa.data);setEntries(en.data);
  setBranchId(x=>br.data?.some(b=>b.id===x)?x:br.data?.[0]?.id||"");
  setAccountId(x=>ac.data?.some(b=>b.id===x)?x:ac.data?.[0]?.id||"");
 },[]);
 React.useEffect(()=>{let live=true;void refresh().catch(e=>{if(live)setError(String(e?.message||e))});return()=>{live=false};},[refresh]);
 const account=accounts.find(a=>a.id===accountId);
 const permittedRef=postingKind==="customer_receipt"?
  sales.filter(s=>s.customer_id&&Number(s.balance_amount)>0&&s.branch_id===account?.branch_id)
  .map(s=>({id:s.id,name:s.invoice_number+" · due "+money(s.balance_amount)})):
 postingKind==="supplier_payment"?
  payables.filter(p=>Number(p.total)>Number(p.paid))
  .map(p=>({id:p.order_id,name:p.order_id.slice(0,8)+" · due "+money(Number(p.total)-Number(p.paid))})):
 postingKind==="customer_advance"?customers.map(c=>({id:c.id,name:c.name})):[];
 async function openAccount(){
  if(inFlight.current)return;
  inFlight.current=true;setBusy(true);setError("");setNotice("");
  try{
   const payload={p_branch_id:branchId,p_kind:kind,p_name:accountName.trim()};
   const body=JSON.stringify(payload);
   pendingAccount.current??={id:crypto.randomUUID(),body};
   if(pendingAccount.current.body!==body)throw new Error("Account request changed; reload before retry.");
   const id=pendingAccount.current.id,a=await context();
   const r=await pgRpc<{account_id:string}>(a.cfg,"saas_finance_open_account_once",{p_account_id:id,...payload});
   if(r.error||r.data?.account_id!==id)throw new Error(r.error?.message||"Account not acknowledged.");
   const check=await pgSelect<{id:string}>(a.cfg,"saas_finance_accounts",
    "select=id&id=eq."+id+"&org_id=eq."+a.org+"&limit=2");
   if(check.error||check.data?.length!==1)throw new Error("Account readback missing; retry same ID.");
   validSession(a.token,a.user);pendingAccount.current=null;await refresh();
   setNotice("Cloud cash/bank account persisted.");
  }catch(e){setError(e instanceof Error?e.message:"Account not confirmed.");}
  finally{inFlight.current=false;setBusy(false);}
 }
 async function post(){
  if(inFlight.current)return;
  inFlight.current=true;setBusy(true);setError("");setNotice("");
  try{
   const val=Number(amount);
   if(!account||!Number.isFinite(val)||val<=0||val>99999999||
    Math.abs(val*100-Math.round(val*100))>1e-7)
    throw new Error("Account and positive two-decimal amount required.");
   const payload={p_account_id:account.id,p_kind:postingKind,
    p_reference_id:postingKind==="expense"?null:referenceId||null,
    p_amount:val,p_note:note.trim()};
   const body=JSON.stringify(payload);
   pendingEntry.current??={id:crypto.randomUUID(),body};
   if(pendingEntry.current.body!==body)
    throw new Error("Posting details changed while retrying; refresh before a new payment.");
   const id=pendingEntry.current.id,a=await context();
   const r=await pgRpc<{entry_id:string;idempotent:boolean}>(a.cfg,
    "saas_finance_post_once",{p_entry_id:id,...payload});
   if(r.error||r.data?.entry_id!==id)throw new Error(r.error?.message||"Finance post not acknowledged.");
   const receipt=await pgSelect<{id:string}>(a.cfg,"saas_finance_entries",
    "select=id&id=eq."+id+"&org_id=eq."+a.org+"&limit=2");
   if(receipt.error||receipt.data?.length!==1)
    throw new Error("Immutable finance receipt not confirmed; retry same ID.");
   validSession(a.token,a.user);pendingEntry.current=null;await refresh();
   setNotice("Finance entry posted atomically and confirmed in Supabase.");
  }catch(e){setError(e instanceof Error?e.message:"Finance posting not confirmed.");}
  finally{inFlight.current=false;setBusy(false);}
 }
 async function loadDaybook(){
  setBusy(true);setError("");setDaybook(null);
  try{
   const a=await context();
   const r=await pgRpc<Daybook>(a.cfg,"saas_finance_daybook",{
    p_from:from,p_to:to,p_branch_id:null});
   if(r.error||!r.data)throw new Error(r.error?.message||"Daybook unavailable.");
   validSession(a.token,a.user);setDaybook(r.data);
  }catch(e){setError(e instanceof Error?e.message:"Daybook failed.");}
  finally{setBusy(false);}
 }
 return <main className="space-y-4 rounded-xl border bg-white p-4">
  <h1 className="text-xl font-semibold">SaaS Cash / Bank · Supplier & Customer Reconciliation</h1>
  <p className="text-xs text-slate-600">Immutable, tenant-scoped finance receipts. Live supplier payables and sale balances post once. Provisional management P&L is not a certified financial statement.</p>
  <section className="grid gap-2 sm:grid-cols-4">
   <label className="text-sm">Branch<select className={input} disabled={busy||!!pendingAccount.current} value={branchId}
    onChange={e=>setBranchId(e.target.value)}>
    {branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
   <label className="text-sm">Account type<select className={input} disabled={busy||!!pendingAccount.current} value={kind}
    onChange={e=>setKind(e.target.value as "cash"|"bank")}>
    <option value="cash">Cash</option><option value="bank">Bank</option></select></label>
   <label className="text-sm">Account name<input className={input} disabled={busy||!!pendingAccount.current}
    value={accountName} onChange={e=>setAccountName(e.target.value)}/></label>
   <button className={button} type="button" disabled={busy} onClick={()=>{void openAccount()}}>
    {pendingAccount.current?"Retry account":"Create account"}</button>
  </section>
  <section className="space-y-2 rounded border p-3">
   <h2 className="font-semibold">Post customer receipt / advance / supplier payment / expense</h2>
   <div className="grid gap-2 sm:grid-cols-4">
    <label className="text-sm">Cash / Bank<select className={input} disabled={busy||!!pendingEntry.current}
     value={accountId} onChange={e=>setAccountId(e.target.value)}>
     {accounts.map(a=><option key={a.id} value={a.id}>{a.kind} · {a.name}</option>)}</select></label>
    <label className="text-sm">Entry type<select className={input} disabled={busy||!!pendingEntry.current}
     value={postingKind} onChange={e=>{setPostingKind(e.target.value as typeof postingKind);setReferenceId("")}}>
     {["customer_receipt","customer_advance","supplier_payment","expense"].map(x=><option key={x} value={x}>{x.replaceAll("_"," ")}</option>)}</select></label>
    {postingKind!=="expense"&&<label className="text-sm">Source<select className={input}
     disabled={busy||!!pendingEntry.current} value={referenceId} onChange={e=>setReferenceId(e.target.value)}>
     <option value="">Select source</option>
     {permittedRef.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
    <label className="text-sm">Amount ₹<input className={input} inputMode="decimal"
     disabled={busy||!!pendingEntry.current} value={amount} onChange={e=>setAmount(e.target.value)}/></label>
    <label className="text-sm sm:col-span-2">Description<input className={input} disabled={busy||!!pendingEntry.current}
     value={note} onChange={e=>setNote(e.target.value)}/></label>
    <button type="button" className={button} disabled={busy||!account}
     onClick={()=>{void post()}}>{pendingEntry.current?"Retry exact posting":"Post to cash / bank"}</button>
   </div>
  </section>
  <section className="space-y-2 rounded border p-3">
   <h2 className="font-semibold">Daybook, GST & provisional operating P&L</h2>
   <div className="flex flex-wrap gap-2">
    <input className={input} type="date" value={from} onChange={e=>setFrom(e.target.value)}/>
    <input className={input} type="date" value={to} onChange={e=>setTo(e.target.value)}/>
    <button className={button} disabled={busy} onClick={()=>{void loadDaybook()}}>Load PostgreSQL daybook</button>
   </div>
   {daybook&&<div className="space-y-1 text-sm">
    <p>POS sales: {money(daybook.sales_gross)} · GST recorded: {money(daybook.sales_gst_recorded)} · COGS: {money(daybook.sales_cogs)}</p>
    <p>Laundry: {money(daybook.laundry_revenue)} · Tailoring: {money(daybook.tailoring_revenue)} · Operating expenses: {money(daybook.operating_expenses)}</p>
    <p>Supplier settlements: {money(daybook.supplier_payments)} · Customer collections: {money(daybook.customer_collections_posted)}</p>
    <p className="font-semibold">Provisional operating surplus: {money(daybook.operating_surplus_estimate)}</p>
    {daybook.cash_bank_accounts.map(a=><p key={a.id}>{a.kind} · {a.name}: <strong>{money(a.balance)}</strong></p>)}
    <p className="text-xs text-amber-700">Tax and accounting status: {daybook.financial_statement_status}</p>
   </div>}
  </section>
  <section className="space-y-1 text-sm">
   <h2 className="font-semibold">Recent immutable finance receipts</h2>
   {entries.slice(0,15).map(e=><p key={e.id}>
    {e.kind.replaceAll("_"," ")} · {money(e.amount)} · {e.note} · {e.id.slice(0,8)}</p>)}
  </section>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {notice&&<p role="status" className="text-sm text-green-700">{notice}</p>}
 </main>;
}
