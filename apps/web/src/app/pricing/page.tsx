import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Plans & Pricing | Minarva Biz",
  description: "Explore proposed Minarva Biz package tiers, from billing and accounts to an integrated business platform. Public prices will be confirmed before paid subscriptions launch.",
};
const packages = [
  { name: "Starter", target: "For a small shop getting organised", includes: ["Billing, quotes and POS workflows","Basic products and stock","Expenses, collections and reports","Windows-first usage"], note: "Core operational features; final limits and supported editions are under review." },
  { name: "Business Pro", target: "For growing shops and service teams", includes: ["Everything in Starter","Customers & CRM","Staff management and attendance","Service jobs and team assignments","Expanded reporting"], note: "Some cross-device and workflow acceptance checks are still in progress." },
  { name: "Business 360", target: "For businesses growing online", includes: ["Everything in Business Pro","Business Website integration — in development","E-commerce Store integration — in development","Marketing integrations — planned","Online and Hybrid capability roadmap"], note: "This is a future package concept. Storefront, website builder and campaign features are not yet available for purchase." },
] as const;
export default function PricingPage() {
  return <div className="min-h-screen bg-[#f6faff] text-[#163455]">
    <header className="border-b border-[#e0eafa] bg-white"><div className="mx-auto flex max-w-[1300px] flex-wrap items-center justify-between gap-3 px-5 py-4 lg:px-10"><a href="/" className="flex items-center gap-2 text-xl font-black text-[#0f2a52]"><img src="/minarva-biz-mark.svg" alt="" width={40} height={36}/>Minarva <span className="text-[#1761ed]">Biz</span></a><nav aria-label="Pricing navigation" className="flex flex-wrap gap-4 text-xs font-bold text-[#3e5875]"><a href="/solutions" className="hover:text-[#1761ed]">All solutions</a><a href="/partners" className="hover:text-[#1761ed]">Partner with us</a><a href="/" className="hover:text-[#1761ed]">Home</a></nav></div></header>
    <main className="mx-auto max-w-[1300px] px-5 pb-20 pt-14 lg:px-10">
      <p className="text-xs font-black uppercase tracking-[.18em] text-[#1763eb]">Packages built around your business</p>
      <h1 className="mt-4 text-[clamp(2.25rem,4.3vw,4rem)] font-black tracking-[-.055em] text-[#0c2852]">One platform. Room to grow.</h1>
      <p className="mt-4 max-w-3xl text-[15px] leading-8 text-[#59738f]">From billing at the counter to managing staff, customers and future online sales, choose only the capabilities you need. Final subscription prices, user limits and launch dates are still being decided.</p>
      <div className="mt-7 inline-flex rounded-full border border-[#b6d3ff] bg-white px-4 py-2 text-sm font-bold text-[#135add]">30-day trial available through supported activation</div>
      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {packages.map((p,i)=><article key={p.name} className={"flex flex-col rounded-[23px] border p-7 shadow-[0_12px_34px_rgba(21,70,132,.05)] "+(i===1?"border-[#8fb8ff] bg-white":"border-[#dce7f7] bg-white")}>
          {i===1?<div className="mb-4 self-start rounded-full bg-[#e9f2ff] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-[#1b60d8]">Proposed popular choice</div>:null}
          <h2 className="text-2xl font-black text-[#11325c]">{p.name}</h2><p className="mt-2 text-sm text-[#647e95]">{p.target}</p>
          <p className="mt-7 border-y border-[#e1e9f4] py-5 text-xl font-black text-[#1760e6]">Pricing to be confirmed</p>
          <ul className="mt-6 space-y-3">{p.includes.map(f=><li key={f} className="flex gap-2 text-[13px] leading-6 text-[#405c76]"><span aria-hidden="true" className="font-black text-[#119a6e]">✓</span>{f}</li>)}</ul>
          <p className="mt-auto pt-7 text-xs leading-6 text-[#7a8998]">{p.note}</p>
        </article>)}
      </div>
      <section className="mt-10 rounded-[22px] border border-[#cee0f7] bg-white p-7 sm:p-9">
        <h2 className="text-2xl font-black text-[#12345d]">Enterprise & Custom Integrations</h2>
        <p className="mt-3 text-sm leading-7 text-[#56738d]">Multiple branches, complex permissions, bespoke integrations and hosted services will require a scoped proposal. We will publish transparent tax, support, renewal and add-on terms when the plans are approved.</p>
      </section>
      <p className="mt-7 text-xs leading-6 text-[#6a8199]">No prices are collected through this website. Listed future modules are not included in today's paid or trial entitlement until separately verified and released.</p>
    </main>
  </div>;
}
