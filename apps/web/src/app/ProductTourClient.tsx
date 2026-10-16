"use client";

import { useState, type KeyboardEvent } from "react";

const workflows = [
  { id: "billing", label: "Billing", eyebrow: "01 / Sales & invoices",
    title: "A faster, cleaner checkout.", description: "See how products, quantities, tax and payments come together in a sample invoice." },
  { id: "inventory", label: "Inventory", eyebrow: "02 / Stock control",
    title: "Know what's moving.", description: "Keep an organized view of product quantities, reorder needs and supplier-related work." },
  { id: "service", label: "Service desk", eyebrow: "03 / Service workflows",
    title: "Every job has a next step.", description: "Register work, assign an engineer and follow the job from visit to completion." },
  { id: "reports", label: "Reports", eyebrow: "04 / Business insights",
    title: "See your day clearly.", description: "Bring sales, stock and operational summaries into a single management view." },
] as const;
type Workflow = (typeof workflows)[number]["id"];

const invoiceLines = [
  { name: "Cotton fabric · 2 m", qty: "2", rate: "₹450", total: "₹900" },
  { name: "Dress alteration", qty: "1", rate: "₹350", total: "₹350" },
  { name: "Printed tote bag", qty: "1", rate: "₹299", total: "₹299" },
];
const stockLines = [
  { name: "Cotton fabric", sku: "FAB-101", qty: "48 m", status: "In stock" },
  { name: "Canvas tote bag", sku: "BAG-204", qty: "8 pcs", status: "Low stock" },
  { name: "Metal zip, 8 inch", sku: "ACC-035", qty: "126 pcs", status: "In stock" },
];
const jobs = [
  { code: "SRV-101", title: "CCTV camera check", stage: "Assigned", tone: "blue" },
  { code: "SRV-102", title: "Laptop service", stage: "In progress", tone: "amber" },
  { code: "SRV-103", title: "Network support", stage: "Completed", tone: "green" },
];
const reportBars = [33, 48, 38, 70, 54, 83, 67, 94, 74, 87, 79, 100];

function Icon({ name, size = "size-4" }: { name: "grid" | "bill" | "stock" | "services" | "chart" | "arrow"; size?: string }) {
  const path = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    bill: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/></>,
    stock: <><path d="m3 7 9-4 9 4v10l-9 4-9-4V7zM3 7l9 4 9-4M12 11v10"/></>,
    services: <><path d="M4 7h16M4 12h16M4 17h10"/><circle cx="18" cy="17" r="2"/></>,
    chart: <><path d="M3 20h18M6 16V9m5 7V5m5 11v-4m5 4V7"/></>,
    arrow: <><path d="M4 12h15m-6-6 6 6-6 6"/></>,
  };
  return <svg aria-hidden="true" className={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{path[name]}</svg>;
}

function Status({ children, tone = "green" }: { children: string; tone?: "green" | "amber" | "blue" }) {
  const color = tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "blue" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700";
  return <span className={"inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold " + color}>{children}</span>;
}

function WorkspaceContent({ selected }: { selected: Workflow }) {
  switch (selected) {
    case "billing":
      return <>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Create invoice</p><h4 className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">New sale</h4></div>
          <Status>Sample invoice</Status>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {["Customer · Walk-in", "Invoice · INV-DEMO-001", "Date · Sample"].map((text) => <div key={text} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[10px] font-medium text-slate-600">{text}</div>)}
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[370px] text-left text-[11px]">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-400"><tr><th className="px-3 py-3">Product / Service</th><th className="px-3 py-3">Qty</th><th className="px-3 py-3">Rate</th><th className="px-3 py-3 text-right">Amount</th></tr></thead>
            <tbody className="text-slate-700">{invoiceLines.map((line) => <tr key={line.name} className="border-t border-slate-100"><td className="px-3 py-3 font-semibold">{line.name}</td><td className="px-3 py-3">{line.qty}</td><td className="px-3 py-3">{line.rate}</td><td className="px-3 py-3 text-right font-bold">{line.total}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4"><div className="text-[11px] text-slate-500">Illustrative subtotal <strong className="ml-2 text-lg text-slate-900">₹1,549</strong></div><span className="rounded-lg bg-[#1461ee] px-4 py-2 text-[11px] font-bold text-white">Preview invoice</span></div>
      </>;
    case "inventory":
      return <>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Products & stock</p><h4 className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">Inventory overview</h4></div><Status>Sample records</Status></div>
        <div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[10px] text-slate-400">Items shown</p><strong className="mt-2 block text-2xl text-slate-900">03</strong></div><div className="rounded-xl border border-amber-100 bg-amber-50 p-4"><p className="text-[10px] text-amber-700">Low stock alerts</p><strong className="mt-2 block text-2xl text-amber-900">01</strong></div></div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[350px] text-left text-[11px]"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400"><tr><th className="px-3 py-3">Item</th><th className="px-3 py-3">SKU</th><th className="px-3 py-3">Quantity</th><th className="px-3 py-3">Status</th></tr></thead><tbody>{stockLines.map((x) => <tr key={x.sku} className="border-t border-slate-100 text-slate-600"><td className="px-3 py-3 font-bold text-slate-800">{x.name}</td><td className="px-3 py-3">{x.sku}</td><td className="px-3 py-3">{x.qty}</td><td className="px-3 py-3"><Status tone={x.status === "Low stock" ? "amber" : "green"}>{x.status}</Status></td></tr>)}</tbody></table></div>
      </>;
    case "service":
      return <>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Service management</p><h4 className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">Job tracking board</h4></div><Status tone="blue">Sample workflow</Status></div>
        <div className="grid gap-3">{jobs.map(job => <div key={job.code} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3.5"><div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e9f2ff] text-[#1461e8]"><Icon name="services"/></span><div className="min-w-0"><p className="text-[10px] font-semibold text-slate-400">{job.code}</p><p className="truncate text-xs font-bold text-slate-800">{job.title}</p></div></div><Status tone={job.tone as "green" | "amber" | "blue"}>{job.stage}</Status></div>)}</div>
        <div className="mt-4 rounded-xl bg-[#eaf3ff] p-4"><p className="text-[11px] font-bold text-[#134ea3]">A clear service journey</p><div className="mt-3 grid grid-cols-4 gap-1.5 text-center">{["Register", "Assign", "Visit", "Close"].map((x, i)=><div key={x}><div className={"h-1.5 rounded-full " + (i < 3 ? "bg-[#1465e8]" : "bg-[#b8d2f5]")}/><p className="mt-2 text-[9px] font-semibold text-[#4c6e9c]">{x}</p></div>)}</div><p className="mt-3 text-[10px] text-[#5d789d]">Customer notifications and feedback automations require verified integration before use.</p></div>
      </>;
    case "reports":
      return <>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Management reports</p><h4 className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">Business snapshot</h4></div><Status>Illustrative data</Status></div>
        <div className="grid grid-cols-3 gap-2.5">{[["Sales", "₹24.5k"], ["Orders", "18"], ["Bills", "12"]].map(x=><div key={x[0]} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4"><p className="text-[10px] text-slate-400">{x[0]}</p><p className="mt-2 text-lg font-extrabold text-slate-900 sm:text-2xl">{x[1]}</p></div>)}</div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><p className="text-[11px] font-bold text-slate-700">Sales activity · example only</p><div aria-label="Illustrative column chart" className="mt-5 flex h-[146px] items-end gap-2 border-b border-slate-100">{reportBars.map((h, i)=><span key={i} className={"min-w-0 flex-1 rounded-t-md " + (i===11?"bg-[#145fe9]":"bg-[#bfdbff]")} style={{height:h+"%"}}/>)}</div><div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>Earlier</span><span>Later</span></div></div>
      </>;
  }
}

const iconFor: Record<Workflow,"bill"|"stock"|"services"|"chart"> = {
  billing: "bill", inventory: "stock", service: "services", reports: "chart",
};

export default function ProductTourClient() {
  const [selected, setSelected] = useState<Workflow>("billing");
  const active = workflows.find(item => item.id === selected) ?? workflows[0];
  function handleKeys(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? workflows.length-1 :
      (index + (event.key === "ArrowRight" ? 1 : -1) + workflows.length) % workflows.length;
    setSelected(workflows[next].id);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  return <div className="grid gap-9 lg:grid-cols-[0.72fr_1.28fr] lg:items-center lg:gap-16">
    <div>
      <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#1b64e8]">Inside Minarva Biz</p>
      <h2 className="mt-5 max-w-lg text-4xl font-extrabold leading-[1.09] tracking-[-0.055em] text-[#0c284e] sm:text-5xl">Less explaining.<br/><span className="text-[#1462ed]">More showing.</span></h2>
      <p className="mt-5 max-w-md text-sm leading-8 text-[#657e9e]">Explore a guided look at the everyday work Minarva Biz is being built to simplify — from the first bill to the end-of-day report.</p>
      <div role="tablist" aria-label="Explore business workflows" className="mt-8 grid grid-cols-2 gap-2 sm:max-w-md">
        {workflows.map((item,index)=><button key={item.id} id={"tour-tab-"+item.id} role="tab" type="button" aria-selected={selected===item.id} aria-controls="tour-workspace-panel" tabIndex={selected===item.id?0:-1} onClick={()=>setSelected(item.id)} onKeyDown={e=>handleKeys(e,index)} className={"flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1460ed] sm:text-sm "+(selected===item.id?"border-[#145fec] bg-[#145fec] text-white shadow-lg shadow-blue-900/10":"border-[#d5e4fa] bg-white text-[#4c6c93] hover:border-[#1260ed] hover:text-[#145acf]")}><Icon name={iconFor[item.id]}/>{item.label}</button>)}
      </div>
      <div aria-live="polite" className="mt-8 max-w-md">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#2164d8]">{active.eyebrow}</p>
        <h3 className="mt-2 text-xl font-extrabold tracking-[-0.025em] text-[#143153]">{active.title}</h3>
        <p className="mt-2 text-sm leading-7 text-[#6c839f]">{active.description}</p>
      </div>
      <p className="mt-6 max-w-md text-[11px] leading-6 text-[#7287a0]"><strong>Illustrative product walkthrough</strong> using sample records, not an authenticated live app or screenshot. Feature availability varies by edition and acceptance status.</p>
    </div>
    <div className="relative min-w-0">
      <div aria-hidden="true" className="absolute -inset-6 rounded-[3rem] bg-[#bedaff]/35 blur-3xl"/>
      <div className="relative overflow-hidden rounded-[1.45rem] border border-[#cbdcf2] bg-white shadow-[0_35px_85px_rgba(22,79,169,0.14)]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-[#fcfdfc] px-4 py-3">
          <div className="flex items-center gap-2"><span className="size-2 rounded-full bg-[#f4ad9f]"/><span className="size-2 rounded-full bg-[#f4d28e]"/><span className="size-2 rounded-full bg-[#91d6b0]"/></div>
          <span className="hidden truncate rounded-md bg-slate-100 px-3 py-1.5 text-[10px] font-medium text-slate-500 sm:block">Minarva Biz / Product walkthrough</span>
          <span className="text-[9px] font-semibold text-slate-400">ILLUSTRATIVE</span>
        </div>
        <div className="grid grid-cols-[46px_minmax(0,1fr)] sm:grid-cols-[128px_minmax(0,1fr)]">
          <aside className="min-h-[430px] border-r border-slate-200 bg-[#0d2c58] p-2 sm:p-3" aria-label="Illustrative workspace navigation">
            <div className="mb-6 flex items-center gap-2 px-1 pt-1 sm:px-2"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#d6e8ff] text-sm font-black text-[#1554bf]">M</span><span className="hidden text-xs font-extrabold text-white sm:block">minarva<span className="text-[#91c8ff]">biz</span></span></div>
            {[["grid","Home"],["bill","Sales"],["stock","Inventory"],["services","Services"],["chart","Reports"]].map(([icon,label])=><div key={label} className={"mb-1 flex items-center gap-2 rounded-lg px-2 py-2.5 text-[11px] font-semibold "+((label==="Sales"&&selected==="billing")||(label==="Inventory"&&selected==="inventory")||(label==="Services"&&selected==="service")||(label==="Reports"&&selected==="reports")?"bg-white/15 text-white":"text-[#a4bfc0]")}><Icon name={icon as "grid"|"bill"|"stock"|"services"|"chart"}/><span className="hidden sm:inline">{label}</span></div>)}
          </aside>
          <div id="tour-workspace-panel" role="tabpanel" aria-labelledby={"tour-tab-"+selected} tabIndex={0} className="min-w-0 bg-[#f8fbff] p-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1464eb] sm:p-5">
            <WorkspaceContent selected={selected}/>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3 text-[10px] font-medium text-slate-400"><span>Online · Windows Offline · Hybrid</span><span>Sample interface only</span></div>
      </div>
      <div className="pointer-events-none absolute -bottom-8 right-1 hidden w-[165px] rotate-[4deg] rounded-[1.7rem] border-[6px] border-[#17353b] bg-[#17353b] p-1 shadow-[0_20px_60px_rgba(8,37,39,0.22)] sm:block lg:-right-6" aria-hidden="true">
        <div className="rounded-[1.1rem] bg-[#f8faf8] p-3">
          <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-[#b8c9c2]"/>
          <p className="text-[10px] font-extrabold text-[#214638]">Minarva Biz</p>
          <p className="mt-1 text-[9px] text-[#7c9388]">Mobile view · concept</p>
          <div className="mt-4 grid grid-cols-2 gap-2">{["Sales","Stock","Orders","Reports"].map((label,i)=><div key={label} className="rounded-lg border border-[#dae8dc] bg-white p-2"><span className={"mb-2 block size-3 rounded-md "+(i===0?"bg-[#16866c]":"bg-[#c3dacc]")}/><p className="text-[8px] font-bold text-[#37564c]">{label}</p></div>)}</div>
          <div className="mt-3 h-10 rounded-lg bg-[#e2f1e5]"/>
          <div className="mt-2 h-10 rounded-lg bg-white"/>
        </div>
      </div>
    </div>
  </div>;
}
