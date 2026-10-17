import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Plans & Pricing | Minarva Biz",
  description: "Compare owner-approved Minarva Biz annual plan prices excluding GST: Starter ₹2,299, Business Pro ₹4,499, Business Web ₹6,699 and Business 360 ₹8,899. Check module availability before subscribing.",
};

const packages = [
  {
    name: "Starter",
    price: "₹2,299",
    target: "Billing essentials for small businesses",
    status: "Core workflows",
    includes: ["Billing, invoices, quotations & POS", "Products, inventory & purchases", "Accounts, expenses & collections", "Business reports"],
    note: "Supported workflows exist. Confirm licensing, supported device/edition and onboarding details before purchasing.",
  },
  {
    name: "Business Pro",
    price: "₹4,499",
    target: "Operations, customers and teams",
    status: "Core workflows",
    includes: ["Everything in Starter", "Customers & CRM", "Staff management & attendance", "Services, assignments & work orders", "Team and business reporting"],
    note: "Some permissions, device sync and cross-edition acceptance checks remain in progress.",
  },
  {
    name: "Business Web",
    price: "₹6,699",
    target: "Business website and digital presence",
    status: "Website integration in development",
    includes: ["Everything in Business Pro", "Integrated Business Website — in development", "Enquiries linked to CRM — planned", "Marketing integrations — planned"],
    note: "Future package: website builder and marketing integrations are not yet available for purchase.",
  },
  {
    name: "Business 360",
    price: "₹8,899",
    target: "The complete connected commerce vision",
    status: "E-commerce integration in development",
    includes: ["Everything in Business Web", "Online Store / E-commerce — in development", "Product catalogue, cart & checkout — planned", "Online order and inventory sync — planned", "Marketing integrations — planned"],
    note: "Future package: e-commerce checkout, website builder and marketing integrations are not yet available for purchase.",
  },
] as const;

export default function PricingPage() {
  return <div className="min-h-screen bg-[#f6faff] text-[#163455]">
    <header className="border-b border-[#e0eafa] bg-white">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-5 py-4 lg:px-10">
        <a href="/" aria-label="Minarva Biz home" className="flex items-center gap-2 text-xl font-black text-[#0f2a52]">
          <img src="/minarva-biz-mark.svg" alt="" width={40} height={36}/>
          Minarva <span className="text-[#1761ed]">Biz</span>
        </a>
        <nav aria-label="Pricing navigation" className="flex flex-wrap items-center gap-4 text-xs font-bold text-[#3e5875]">
          <a href="/solutions" className="hover:text-[#1761ed]">All solutions</a>
          <a href="/partners" className="hover:text-[#1761ed]">Partner with us</a>
          <a href="/" className="hover:text-[#1761ed]">Home</a>
        </nav>
      </div>
    </header>
    <main className="mx-auto max-w-[1500px] px-5 pb-20 pt-14 lg:px-10">
      <p className="text-xs font-black uppercase tracking-[.18em] text-[#1763eb]">Business software that grows with you</p>
      <h1 className="mt-4 text-[clamp(2.25rem,4.3vw,4rem)] font-black leading-tight tracking-[-.055em] text-[#0c2852]">
        Simple plans. <span className="text-[#1763ec]">One connected platform.</span>
      </h1>
      <p className="mt-4 max-w-3xl text-[15px] leading-8 text-[#59738f]">
        Start with billing, inventory and accounts. Add CRM, attendance, services and — as they are released — your business website, online store and marketing tools.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-2 text-xs font-bold text-[#1658b0]">
        <span className="rounded-full border border-[#b6d3ff] bg-white px-4 py-2">Annual subscription</span>
        <span className="rounded-full border border-[#b6d3ff] bg-white px-4 py-2">All prices exclude GST</span>
        <span className="rounded-full border border-[#b6d3ff] bg-white px-4 py-2">30-day trial with supported activation</span>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {packages.map((p, i) => <article key={p.name} className={"flex flex-col rounded-[23px] border p-6 shadow-[0_12px_34px_rgba(21,70,132,.05)] sm:p-7 " + (i === 1 ? "border-[#8fb8ff] bg-white ring-1 ring-[#c7ddff]" : "border-[#dce7f7] bg-white")}>
          {i === 1 ? <p className="mb-4 self-start rounded-full bg-[#e9f2ff] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-[#1b60d8]">For growing businesses</p> : null}
          <h2 className="text-2xl font-black tracking-tight text-[#11325c]">{p.name}</h2>
          <p className="mt-2 min-h-12 text-sm leading-6 text-[#647e95]">{p.target}</p>
          <div className="mt-6 border-y border-[#e1e9f4] py-5">
            <p className="text-[clamp(2rem,2.6vw,2.7rem)] font-black tracking-[-.05em] text-[#1760e6]">{p.price}</p>
            <p className="mt-1 text-xs font-semibold text-[#637c96]">per year + GST</p>
          </div>
          <p className={"mt-5 self-start rounded-full px-3 py-1.5 text-[10px] font-black " + (i < 2 ? "bg-[#eaf5f1] text-[#177451]" : "bg-[#fff4e4] text-[#a06314]")}>{p.status}</p>
          <ul className="mt-6 space-y-3">
            {p.includes.map(f => <li key={f} className="flex gap-2.5 text-[13px] leading-6 text-[#405c76]"><span aria-hidden="true" className="font-black text-[#119a6e]">✓</span><span>{f}</span></li>)}
          </ul>
          <p className="mt-auto pt-7 text-xs leading-6 text-[#6a8298]">{p.note}</p>
        </article>)}
      </div>
      <section className="mt-9 rounded-[22px] border border-[#cddff8] bg-white p-7 sm:p-9">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[.14em] text-[#1763e7]">Enterprise</p>
            <h2 className="mt-2 text-2xl font-black text-[#12345d]">Custom Quote</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[#56738d]">Multi-branch businesses, custom integrations, larger teams, migrations and bespoke support: scoped individually.</p>
          </div>
          <a href="/partners" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-[#bad2f4] px-5 py-3 text-xs font-black text-[#1456a7] hover:bg-[#f2f7ff]">Explore partnership →</a>
        </div>
      </section>
      <section className="mt-9 max-w-4xl text-xs leading-7 text-[#5a7897]">
        <h2 className="text-base font-black text-[#12375f]">Before you choose</h2>
        <p className="mt-3">Annual prices are owner-approved, excluding applicable GST. Final user/device limits, included support and third-party charges are being defined. Custom domains, payment gateway charges and paid messaging services may cost extra.</p>
        <p className="mt-3">Business Web and Business 360 describe the future integrated product. Website creation, online checkout and automated marketing are <strong>not yet available for purchase</strong>; these features will only be offered after verified release. No checkout or payment collection is enabled on this website.</p>
      </section>
    </main>
  </div>;
}
