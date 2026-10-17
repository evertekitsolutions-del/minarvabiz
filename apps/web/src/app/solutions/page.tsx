import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Complete Business Solution | Minarva Biz",
  description: "Explore the connected Minarva Biz vision: billing, accounts, inventory, CRM, staff attendance, service operations, business websites, online stores and marketing tools. See module readiness before choosing.",
};

const modules = [
  { name: "Billing & POS", stage: "Available workflows", summary: "Invoices, quotations, sales, returns and customer payments.", code: "01", tone: "bg-blue-50 text-blue-700" },
  { name: "Inventory & Purchases", stage: "Available workflows", summary: "Products, stock, purchases, suppliers and warehouse operations.", code: "02", tone: "bg-cyan-50 text-cyan-700" },
  { name: "GST & Accounting", stage: "Available workflows", summary: "Tax-aware billing, expenses, collections and financial reports. Regulatory readiness varies by workflow.", code: "03", tone: "bg-amber-50 text-amber-700" },
  { name: "Customers & CRM", stage: "Available workflows", summary: "Customer profiles, follow-up records and service relationships.", code: "04", tone: "bg-emerald-50 text-emerald-700" },
  { name: "Staff & Attendance", stage: "Available workflows", summary: "Staff records, roles, attendance, roster and assignment workflows. Verify edition-specific readiness.", code: "05", tone: "bg-purple-50 text-purple-700" },
  { name: "Services & Field Operations", stage: "Available workflows", summary: "Repair registrations, job status, engineers, customer follow-ups and service history.", code: "06", tone: "bg-teal-50 text-teal-700" },
  { name: "Business Website", stage: "In development", summary: "A business-facing website connected to products, enquiries and customer activity — planned customer offering, not yet a live site builder.", code: "07", tone: "bg-indigo-50 text-indigo-700" },
  { name: "Online Store / E-commerce", stage: "In development", summary: "Online catalogue, cart, orders and stock synchronization as part of the shared business platform. Commerce checkout is not yet available.", code: "08", tone: "bg-pink-50 text-pink-700" },
  { name: "Marketing & Growth", stage: "Planned integration", summary: "Campaigns, customer engagement, enquiry conversion and consent-based messaging integrations, subject to provider approvals.", code: "09", tone: "bg-orange-50 text-orange-700" },
  { name: "Reports & Management", stage: "Available workflows", summary: "Sales, collections, inventory, staff and operations reporting within the supported edition.", code: "10", tone: "bg-sky-50 text-sky-700" },
] as const;

export default function CompleteBusinessSolutions() {
  return <div className="min-h-screen bg-white text-[#153052]">
    <header className="border-b border-[#e4ecf8] bg-white">
      <div className="mx-auto flex max-w-[1420px] flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-10">
        <a href="/" aria-label="Minarva Biz home" className="flex items-center gap-2.5 text-xl font-black tracking-[-.04em] text-[#0c2852]"><img src="/minarva-biz-mark.svg" alt="" width={40} height={36}/>Minarva <span className="text-[#1761ed]">Biz</span></a>
        <nav aria-label="Solutions navigation" className="flex flex-wrap items-center gap-4 text-xs font-bold text-[#375779]">
          <a href="/" className="hover:text-[#1761ed]">Home</a><a href="/pricing" className="hover:text-[#1761ed]">Pricing</a><a href="/partners" className="hover:text-[#1761ed]">Partner with us</a><a href="/login" className="rounded-xl bg-[#1761ed] px-4 py-3 text-white hover:bg-[#114ac4]">Customer login</a>
        </nav>
      </div>
    </header>
    <main id="solutions-main">
      <section className="border-b border-[#e4ecf8] bg-[linear-gradient(110deg,#ebf4ff,#f8fbff_58%,white)]">
        <div className="mx-auto max-w-[1420px] px-5 py-14 sm:py-20 lg:px-10">
          <p className="text-xs font-black uppercase tracking-[.18em] text-[#1464e6]">One connected business platform</p>
          <h1 className="mt-5 max-w-5xl text-[clamp(2.3rem,5vw,4.5rem)] font-black leading-[1.1] tracking-[-.055em] text-[#0b2650]">Manage. Sell. Serve. <span className="text-[#1765f0]">Grow.</span></h1>
          <p className="mt-6 max-w-3xl text-[15px] leading-8 text-[#57738f]">The Minarva Biz vision connects billing, accounts, stock, customers, staff, services, your business website, online store and marketing in one platform — without forcing you to operate ten unrelated systems.</p>
          <div className="mt-7 flex flex-wrap gap-3"><a href="#modules" className="rounded-xl bg-[#1762e8] px-6 py-3.5 text-sm font-extrabold text-white">Explore the platform</a><a href="/pricing" className="rounded-xl border border-[#b9d1f3] bg-white px-6 py-3.5 text-sm font-bold text-[#16468a]">Compare proposed packages</a></div>
          <p className="mt-5 max-w-3xl text-xs leading-6 text-[#5f7892]">Product roadmap and current capabilities are shown separately below. Listed future integrations are not promises of availability in today's installer or trial.</p>
        </div>
      </section>
      <section id="modules" className="mx-auto max-w-[1420px] scroll-mt-12 px-5 py-14 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#1761ed]">Connected capabilities</p><h2 className="mt-3 text-3xl font-black tracking-tight text-[#102b52] sm:text-4xl">Everything around your business</h2></div><p className="max-w-md text-sm leading-7 text-[#657e95]">A transparent view of what is available in parts of today's product and what belongs to the integration roadmap.</p></div>
        <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map(m=><article key={m.name} className="rounded-[20px] border border-[#dfe9f7] bg-white p-6 shadow-[0_8px_24px_rgba(24,78,142,.035)]">
            <div className="flex items-center justify-between"><span className={"grid size-12 place-items-center rounded-2xl text-sm font-black "+m.tone}>{m.code}</span><span className="rounded-full border border-[#dfe8f5] px-3 py-1 text-[10px] font-bold text-[#526d8b]">{m.stage}</span></div>
            <h3 className="mt-5 text-lg font-black tracking-tight text-[#13345b]">{m.name}</h3><p className="mt-3 text-[13px] leading-6 text-[#647e96]">{m.summary}</p>
          </article>)}
        </div>
      </section>
      <section className="bg-[#0d3269] text-white"><div className="mx-auto grid max-w-[1420px] gap-6 px-5 py-14 lg:grid-cols-[1fr_auto] lg:items-center lg:px-10"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#91c4ff]">Work your way</p><h2 className="mt-3 text-3xl font-black">Windows Offline. Online. Hybrid.</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-[#ccdef4]">A shared data experience is the architectural direction. Cross-device sync and full multi-mode acceptance remain in progress.</p></div><a href="/" className="rounded-xl bg-white px-6 py-3.5 text-sm font-black text-[#164481]">Back to Minarva Biz</a></div></section>
    </main>
  </div>;
}
