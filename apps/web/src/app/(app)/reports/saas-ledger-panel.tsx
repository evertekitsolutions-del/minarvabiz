"use client";

import * as React from "react";
import { configFromEnv, pgRpc, pgSelect } from "@minarvabiz/database";
import { can, getSessionToken, getSessionUser } from "@minarvabiz/business-logic";
import { resolveOnlineAuthorization } from "../../../lib/data-source";

type Party={id:string;name:string};
type LedgerRow={
  entry_at:string;source_type:string;source_id:string;
  reference:string;debit:number;credit:number;
};
type Gst={gross:number;net:number;tax:number;credit_outstanding:number;sales_count:number};
const money=(n:number)=>"₹"+n.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
export function SaasLedgerPanel(){
  const [customers,setCustomers]=React.useState<Party[]>([]);
  const [suppliers,setSuppliers]=React.useState<Party[]>([]);
  const [kind,setKind]=React.useState<"customer"|"supplier">("customer");
  const [partyId,setPartyId]=React.useState("");
  const [ledger,setLedger]=React.useState<LedgerRow[]>([]);
  const [gst,setGst]=React.useState<Gst|null>(null);
  const [from,setFrom]=React.useState("2026-11-01");
  const [to,setTo]=React.useState("2026-11-30");
  const [busy,setBusy]=React.useState(false);
  const [error,setError]=React.useState("");
  const [loaded,setLoaded]=React.useState(false);

  async function auth(){
    const c=configFromEnv(),t=getSessionToken(),u=getSessionUser();
    if(!c||!t||!u?.id)throw new Error("Verified cloud sign-in is required.");
    const a=await resolveOnlineAuthorization(t,u.id);
    if(!a.ok)throw new Error(a.error);
    if(!can("accounting.view")&&!can("reports.view"))
      throw new Error("Finance/report permission required.");
    return {cfg:{...c,accessToken:t},token:t,user:u.id,org:a.orgId};
  }
  const loadParties=React.useCallback(async()=>{
    const a=await auth();
    const [c,s]=await Promise.all([
      pgSelect<Party>(a.cfg,"customers","select=id,name&org_id=eq."+a.org+"&deleted_at=is.null&order=name.asc&limit=1000"),
      pgSelect<Party>(a.cfg,"suppliers","select=id,name&org_id=eq."+a.org+"&order=name.asc&limit=1000"),
    ]);
    if(c.error||s.error||!c.data||!s.data)
      throw new Error(c.error?.message||s.error?.message||"Could not load tenant parties.");
    if(a.token!==getSessionToken()||a.user!==getSessionUser()?.id)
      throw new Error("Session changed while loading ledger parties.");
    setCustomers(c.data);setSuppliers(s.data);
    setPartyId(prev=>c.data?.some(x=>x.id===prev)?prev:(c.data?.[0]?.id||""));
  },[]);
  React.useEffect(()=>{let active=true;void loadParties().catch(e=>{if(active)setError(String(e.message||e))});return()=>{active=false};},[loadParties]);
  async function run(){
    setBusy(true);setError("");setLoaded(false);
    try{
      const a=await auth();
      const start=new Date(from+"T00:00:00Z"),end=new Date(to+"T00:00:00Z");
      end.setUTCDate(end.getUTCDate()+1);
      if(!Number.isFinite(start.valueOf())||!Number.isFinite(end.valueOf())||
         end<=start||end.valueOf()-start.valueOf()>366*86400000)
         throw new Error("Choose a valid report period (maximum one year).");
      const result=await pgRpc<Gst>(a.cfg,"saas_gst_sales_summary",{
        p_from:start.toISOString(),p_to:end.toISOString(),p_branch_id:null,
      });
      if(result.error||!result.data)throw new Error(result.error?.message||"GST cloud query failed.");
      let rows:LedgerRow[]=[];
      if(partyId){
        const l=await pgRpc<LedgerRow[]>(a.cfg,"saas_party_ledger",{
          p_party_type:kind,p_party_id:partyId,p_branch_id:null,
        });
        if(l.error||!Array.isArray(l.data))throw new Error(l.error?.message||"Tenant ledger cloud query failed.");
        rows=l.data.sort((x,y)=>x.entry_at.localeCompare(y.entry_at));
      }
      if(a.token!==getSessionToken()||a.user!==getSessionUser()?.id)
        throw new Error("Cloud reports rejected after account switch.");
      setGst(result.data);setLedger(rows);setLoaded(true);
    }catch(e){setError(e instanceof Error?e.message:"Cloud ledger NOT verified.");}
    finally{setBusy(false);}
  }
  const parties=kind==="customer"?customers:suppliers;
  const debits=ledger.reduce((s,x)=>s+Number(x.debit||0),0);
  const credits=ledger.reduce((s,x)=>s+Number(x.credit||0),0);
  return <section className="space-y-4 rounded-xl border bg-white p-4">
    <h3 className="text-lg font-semibold">Cloud Accounts · GST & Unified Party Ledger</h3>
    <p className="text-xs text-slate-600">Read-only, tenant-scoped PostgreSQL report. No local accounting snapshots.</p>
    <div className="grid gap-2 sm:grid-cols-5">
      <label className="text-sm">Ledger type
        <select className="mt-1 w-full rounded border p-2" value={kind}
          onChange={e=>{const k=e.target.value as "customer"|"supplier";setKind(k);const rows=k==="customer"?customers:suppliers;setPartyId(rows[0]?.id||"");}}>
          <option value="customer">Customer</option><option value="supplier">Supplier</option>
        </select>
      </label>
      <label className="text-sm">Party
        <select className="mt-1 w-full rounded border p-2" value={partyId}
         onChange={e=>setPartyId(e.target.value)}>
          <option value="">GST report only</option>
          {parties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className="text-sm">From
        <input className="mt-1 w-full rounded border p-2" type="date" value={from}
          onChange={e=>setFrom(e.target.value)}/>
      </label>
      <label className="text-sm">Through
        <input className="mt-1 w-full rounded border p-2" type="date" value={to}
          onChange={e=>setTo(e.target.value)}/>
      </label>
      <button type="button" disabled={busy} onClick={()=>{void run()}}
        className="self-end rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-50">
        {busy?"Verifying cloud…":"Load audited report"}
      </button>
    </div>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    {loaded&&gst&&<>
      <div className="grid gap-2 sm:grid-cols-4 text-sm">
        <div>Gross sales <strong>{money(Number(gst.gross))}</strong></div>
        <div>Net sales <strong>{money(Number(gst.net))}</strong></div>
        <div>GST collected <strong>{money(Number(gst.tax))}</strong></div>
        <div>Outstanding <strong>{money(Number(gst.credit_outstanding))}</strong></div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm"><thead><tr>
          <th className="p-2">Date</th><th>Source</th><th>Reference</th>
          <th>Debit</th><th>Credit</th>
        </tr></thead><tbody>
          {ledger.map(r=><tr key={r.source_type+"-"+r.source_id} className="border-t">
            <td className="p-2">{new Date(r.entry_at).toLocaleDateString()}</td>
            <td>{r.source_type}</td><td>{r.reference}</td>
            <td>{money(Number(r.debit||0))}</td><td>{money(Number(r.credit||0))}</td>
          </tr>)}
        </tbody></table>
      </div>
      {partyId&&<p className="text-sm font-semibold">Debit {money(debits)}
        · Credit {money(credits)} · Difference {money(debits-credits)}</p>}
    </>}
  </section>;
}
