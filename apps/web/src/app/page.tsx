import type { Metadata } from "next";
import ProductTourClient from "./ProductTourClient";
import TrialWelcomePopup from "./TrialWelcomePopup";

export const metadata: Metadata = {
  title: "Minarva Biz | Business Management, Beautifully Connected",
  description: "Explore the Minarva Biz business platform for billing, inventory, GST workflows, services, tailoring, laundry and reporting. Browser, Windows Offline and Hybrid editions.",
  robots: { index: true, follow: true },
};

const releaseUrl = "https://github.com/evertekitsolutions-del/minarvabiz/releases/tag/v1.0.15";
const navigation = [
  { title: "Product tour", href: "#product-tour" },
  { title: "Features", href: "#features" },
  { title: "Workflows", href: "#workflows" },
  { title: "Industries", href: "#industries" },
  { title: "Editions", href: "#editions" },
  { title: "Download", href: "#download" },
  { title: "FAQ", href: "#faq" },
] as const;

type IconName = "receipt" | "box" | "tax" | "tool" | "shirt" | "laundry" | "users" | "chart" | "store" | "camera" | "warehouse" | "arrow" | "check" | "cloud" | "monitor" | "smartphone";
function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/></>,
    box: <><path d="m3 7 9-4 9 4v10l-9 4-9-4V7Z"/><path d="m3 7 9 4 9-4M12 11v10"/></>,
    tax: <><path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
    tool: <><path d="M14 6a5 5 0 0 0-6 6l-5 5a2 2 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-3-3z"/></>,
    shirt: <><path d="m8 4 4 2 4-2 5 5-4 4-2-2v10H9V11l-2 2-4-4z"/></>,
    laundry: <><rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="5"/><path d="M7 7h.01M11 7h.01"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5v1"/></>,
    chart: <><path d="M3 20h18M7 16V9m5 7V5m5 11v-7"/></>,
    store: <><path d="M3 10h18l-2-6H5zM5 10v11h14V10M9 21v-7h6v7"/></>,
    camera: <><rect x="3" y="7" width="12" height="10" rx="2"/><path d="m15 10 6-3v10l-6-3"/></>,
    warehouse: <><path d="m2 10 10-7 10 7v11H2V10zM7 21v-8h10v8M7 17h10"/></>,
    arrow: <><path d="M4 12h16m-6-6 6 6-6 6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    cloud: <><path d="M6 17a5 5 0 1 1 2-9 7 7 0 0 1 13 5 4 4 0 0 1-4 4H6"/></>,
    monitor: <><rect x="2" y="3" width="20" height="15" rx="2"/><path d="M8 22h8M12 18v4"/></>,
    smartphone: <><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 19h2"/></>,
  };
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
function Logo({ inverse = false }: { inverse?: boolean }) {
  return <a href="/" aria-label="Minarva Biz home" className="inline-flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1760ef]">
    <img src="/minarva-biz-mark.svg" alt="" width={46} height={40} decoding="async" className="h-10 w-[46px] shrink-0 object-contain" />
    <span className={"text-[21px] font-black tracking-[-0.06em] " + (inverse ? "text-white" : "text-[#091e43]")}>Minarva <span className="text-[#1764ed]">Biz</span></span>
  </a>;
}
const features: { title: string; slug: string; detail: string; icon: IconName; tone: string; support: string }[] = [
  { title: "Billing & POS", slug:"billing-pos", detail: "Sales, quotations, payments and print-ready invoices.", icon: "receipt", tone: "bg-[#e7f0ff] text-[#155ee5]", support: "SALES" },
  { title: "Inventory", slug:"inventory", detail: "Products, suppliers, stock movement and reorder visibility.", icon: "box", tone: "bg-[#ebf4ff] text-[#4382e9]", support: "STOCK" },
  { title: "GST & Accounting", slug:"gst-accounting", detail: "Tax-aware invoices, expenses and business accounts.", icon: "tax", tone: "bg-[#fff0e5] text-[#ee7e20]", support: "ACCOUNTS" },
  { title: "Service Management", slug:"service-management", detail: "Service registration, allocations, jobs and progress tracking.", icon: "tool", tone: "bg-[#e5f4ff] text-[#1294c9]", support: "SERVICE" },
  { title: "Tailoring", slug:"tailoring", detail: "Measurements, alterations and made-to-order workflows.", icon: "shirt", tone: "bg-[#f2eaff] text-[#8652de]", support: "ORDERS" },
  { title: "Laundry", slug:"laundry", detail: "Laundry and ironing orders, tracking and handover.", icon: "laundry", tone: "bg-[#ffe9f1] text-[#d94a79]", support: "DELIVERY" },
  { title: "Customers & CRM", slug:"customers-crm", detail: "Customer records and balances beside daily operations.", icon: "users", tone: "bg-[#e9f9ef] text-[#16945c]", support: "CUSTOMERS" },
  { title: "Reports & Analytics", slug:"reports-analytics", detail: "Management visibility across sales, purchases and operations.", icon: "chart", tone: "bg-[#e4f7f4] text-[#138d89]", support: "INSIGHTS" },
];
const industries: {title:string;description:string;icon:IconName;accent:string;scene:string;slug:string}[] = [
  {title:"Retail Store",slug:"retail-store",description:"Point of sale, product stock and purchases",icon:"store",accent:"from-[#fef1d8] via-[#fce2bb] to-[#edb881]",scene:"Shelf & checkout"},
  {title:"Boutique & Fashion",slug:"boutique-fashion",description:"Readymade, fabric, tailoring and alterations",icon:"shirt",accent:"from-[#fbe7f4] via-[#ecd9f5] to-[#d9b4e5]",scene:"Fashion & garments"},
  {title:"Computer & Electronics",slug:"computer-electronics",description:"Products, repairs, accessories and service",icon:"monitor",accent:"from-[#d8eaff] via-[#c6dafa] to-[#8eb6f4]",scene:"Devices & service"},
  {title:"Service Centers",slug:"service-centers",description:"Field work, engineers and service jobs",icon:"camera",accent:"from-[#def8f5] via-[#c8eee8] to-[#91d4c8]",scene:"Support & repairs"},
  {title:"Laundry & Ironing",slug:"laundry-ironing",description:"Garment orders, pickup, delivery and tracking",icon:"laundry",accent:"from-[#e4ebff] via-[#d9e2ff] to-[#a7bbed]",scene:"Cleaning & delivery"},
  {title:"Wholesale",slug:"wholesale",description:"Bulk sales, purchase orders and supplier records",icon:"warehouse",accent:"from-[#ffeedc] via-[#f8dfc5] to-[#e6ae76]",scene:"Bulk stock"},
];
const faqs = [
  { question: "Can Minarva Biz work without the internet?", answer: "The Windows edition is designed for local-first workflows. Online operations and synchronization require connectivity. Real customer Offline/Hybrid acceptance is still in progress." },
  { question: "Does this website show real customer business data?", answer: "No. The hero dashboard is a design-reference image, not a live application screenshot; the product walkthrough is illustrative. Real customer data is not published here." },
  { question: "How long is the free trial?", answer: "The Minarva Biz trial period is 30 days. Self-service signup and automatic trial activation are still in progress; trial access requires supported activation." },
  { question: "Are all features available for every business?", answer: "Availability depends on edition, module readiness, location-specific requirements and verification. The product direction is broad, but this website does not claim universal readiness." },
  { question: "How do I download the Windows edition?", answer: "The Download button links to the official v1.0.15 GitHub release. Review the available installer assets and release notes before installing." },
] as const;
export default function PublicHomePage() {
  return <div className="min-h-screen overflow-x-clip bg-white text-[#10243e]">
    <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:rounded-lg focus:bg-white focus:p-3">Skip to content</a>
    <TrialWelcomePopup/>
    <header className="sticky top-0 z-50 border-b border-[#e5edfa] bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1720px] flex-wrap items-center justify-between gap-4 px-5 py-3.5 lg:px-9">
        <Logo/>
        <nav aria-label="Main navigation" className="hidden items-center gap-6 text-[12px] font-bold text-[#44566c] lg:flex">
          {navigation.map(n=><a key={n.href} href={n.href} className="rounded-md transition hover:text-[#145bea] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1760ef]">{n.title}</a>)}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <a href="/login" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[#bcd2fc] bg-white px-4 text-xs font-bold text-[#1254dc] transition hover:bg-[#eff5ff] sm:text-sm">Customer login</a>
          <a href={releaseUrl} target="_blank" rel="noopener noreferrer" className="hidden min-h-10 items-center justify-center gap-2 rounded-xl bg-[#165fee] px-4 text-xs font-extrabold text-white shadow-[0_7px_18px_rgba(27,101,232,.2)] transition hover:bg-[#084bc9] sm:inline-flex"><Icon name="monitor" className="size-4"/>Windows download</a>
        </div>
        <details className="group w-full lg:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-[#d6e3fc] bg-[#f8fbff] px-4 py-3 text-sm font-bold text-[#243e6c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1760ef] [&::-webkit-details-marker]:hidden">
            Browse sections <span aria-hidden="true" className="text-[#125fed] transition group-open:rotate-45">+</span>
          </summary>
          <nav aria-label="Mobile navigation" className="mt-2 grid grid-cols-2 gap-1 rounded-xl border border-[#d9e6f7] bg-white p-2 shadow-md">
            {navigation.map(n=><a key={n.href} href={n.href} className="rounded-lg px-3 py-3 text-xs font-bold text-[#34516c] hover:bg-[#edf5ff]">{n.title}</a>)}
          </nav>
        </details>
      </div>
    </header>
    <main id="main">
      <section className="relative isolate overflow-hidden bg-[linear-gradient(110deg,#f0f7ff_0%,#f8fbff_50%,#ffffff_100%)]">
        <div className="pointer-events-none absolute -right-20 -top-60 size-[700px] rounded-full bg-[#dbeafa]/45 blur-[95px]" aria-hidden="true"/>
        <div className="relative mx-auto grid max-w-[1720px] items-center gap-7 px-5 py-9 sm:py-11 lg:grid-cols-[0.88fr_1.12fr] lg:gap-8 lg:px-9 lg:py-12">
          <div className="relative z-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#d7e7ff] bg-[#e6f1ff] px-4 py-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#1459e7]">Business management · Reimagined</span>
            <h1 className="mt-4 max-w-[740px] text-[clamp(2.1rem,3.35vw,3.65rem)] font-black leading-[1.12] tracking-[-0.054em] text-[#0b2146]">
              Manage Your Business<br/><span className="text-[#1463ee]">Smarter with Minarva Biz.</span>
            </h1>
            <p className="mt-4 max-w-[670px] text-[14px] leading-6 text-[#536b86] sm:text-[15px] sm:leading-7">
              Billing, inventory, accounts, services, tailoring, laundry and more — brought into one connected business workspace.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-bold text-[#3b5b7a] sm:text-xs">
              {["Built around real workflows","Windows local-first","Flexible business modules"].map(x=><span key={x} className="inline-flex items-center gap-1.5 rounded-full border border-[#dbeaf8] bg-white/90 px-3 py-2"><Icon name="check" className="size-4 text-[#0ca569]"/>{x}</span>)}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <a href={releaseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#1260f1] px-6 py-3.5 text-sm font-extrabold text-white shadow-[0_15px_32px_rgba(21,93,220,.23)] transition hover:-translate-y-0.5 hover:bg-[#0e4fca]">
                <Icon name="monitor" className="size-[18px]"/> Download for Windows <Icon name="arrow" className="size-4"/>
              </a>
              <a href="#product-tour" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#b9cff4] bg-white px-6 py-3.5 text-sm font-bold text-[#154ba6] transition hover:bg-[#eaf2ff]">
                <span aria-hidden="true" className="grid size-6 place-items-center rounded-full bg-[#e7f0ff] text-[#135dec]">▶</span> Explore product tour
              </a>
            </div>
            <p className="mt-3 max-w-[670px] text-[11px] leading-5 text-[#6d8199]">
              Official published Windows release: v1.0.15. Self-service signup and some cross-edition acceptance steps are still in progress.
            </p>
          </div>
          <div className="relative min-w-0 pb-3">
            <div className="absolute -inset-5 rounded-[3rem] bg-[#bdd9fc]/35 blur-3xl" aria-hidden="true"/>
            <div className="relative ml-auto overflow-hidden rounded-[17px] border-[5px] border-[#162b49] bg-white shadow-[0_20px_54px_rgba(24,49,85,.19)] sm:border-[7px]">
              <div className="flex h-9 items-center gap-1.5 border-b border-[#e7edf8] bg-[#f8fbff] px-4"><span className="size-2 rounded-full bg-[#ffab91]"/><span className="size-2 rounded-full bg-[#fad280]"/><span className="size-2 rounded-full bg-[#85d8ae]"/><span className="ml-auto rounded-md bg-[#edf3fa] px-3 py-1 text-[9px] font-semibold text-[#778aa2]">Minarva Biz · Interface reference</span></div>
              <img src="/marketing-dashboard.jpg" alt="Minarva Biz boutique business dashboard design reference with navigation, reporting charts and order information" width={1500} height={1000} loading="eager" decoding="async" className="block h-auto w-full object-contain"/>
            </div>
            <div className="absolute -bottom-1 -left-2 w-[33%] min-w-[124px] max-w-[190px] rounded-[23px] border-[6px] border-[#142943] bg-white p-2 shadow-[0_18px_45px_rgba(12,49,95,.28)] sm:-left-8 sm:bottom-0" aria-hidden="true">
              <div className="mx-auto mb-2 h-1 w-12 rounded-full bg-[#b3c3d8]"/>
              <div className="rounded-lg bg-[#1162f0] p-2 text-[10px] font-black text-white">MINARVA BIZ</div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {["Sales","Stock","Customers","Services","Reports","More"].map((x,i)=><span key={x} className="rounded-md border border-[#e1eaf5] bg-[#f7fbff] p-1.5 text-center text-[8px] font-semibold text-[#315573]"><span className={"mx-auto mb-1 block size-2 rounded-md "+(i%2?"bg-[#55b7f4]":"bg-[#1763ed]")}/>{x}</span>)}
              </div>
            </div>
            <p className="relative mt-3 pl-[34%] text-right text-[10px] leading-4 text-[#66809a] sm:pl-28">
              Illustrative interface reference — not a live application screenshot or real customer data.
            </p>
          </div>
        </div>
      </section>
      <section aria-label="Explore business modules" className="border-y border-[#d9e6fb] bg-[#f8fbff]">
        <div className="mx-auto max-w-[1720px] px-5 py-4 lg:px-9">
          <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#3973bf]">Explore 8 connected business modules</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            {features.map((item) => (
              <a key={item.slug} href={"/features/"+item.slug} className="flex min-h-[58px] items-center gap-2.5 rounded-xl border border-[#e0eafb] bg-white px-3 py-2.5 text-[12px] font-bold leading-4 text-[#20436d] transition hover:border-[#9cc1fc] hover:bg-[#edf5ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1464ed]">
                <span className={"grid size-9 shrink-0 place-items-center rounded-lg "+item.tone}><Icon name={item.icon} className="size-4.5"/></span>
                <span>{item.title}</span>
              </a>
            ))}
          </div>
        </div>
      </section>
      <section id="features" className="scroll-mt-28 mx-auto max-w-[1720px] px-5 py-14 sm:py-16 lg:px-9">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#1b68eb]">One business. All the essentials.</p><h2 className="mt-3 text-[clamp(1.75rem,2.65vw,2.8rem)] font-black tracking-[-0.04em] text-[#0b2347] sm:text-5xl">Everything you need to<br/><span className="text-[#1463ee]">manage your business.</span></h2></div>
          <p className="max-w-[385px] text-sm leading-7 text-[#657b93]">Practical tools for everyday operations, from a busy checkout to the service team and business owner.</p>
        </div>
        <div className="mt-11 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f,i)=><a key={f.slug} href={"/features/"+f.slug} aria-label={"Explore "+f.title+" workflows"} className="group rounded-[20px] border border-[#e1eaf5] bg-white p-6 transition hover:-translate-y-1 hover:border-[#bdd6fb] hover:shadow-[0_18px_40px_rgba(29,83,145,.09)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1662ec]">
            <div className="flex items-start justify-between"><span className={"grid size-12 place-items-center rounded-2xl "+f.tone}><Icon name={f.icon} className="size-6"/></span><span className="text-xs font-extrabold text-[#aac0db]">{String(i+1).padStart(2,"0")}</span></div>
            <p className="mt-7 text-[10px] font-extrabold tracking-[0.14em] text-[#3770dc]">{f.support}</p>
            <h3 className="mt-2 text-lg font-black tracking-tight text-[#152d4c]">{f.title}</h3>
            <p className="mt-3 text-[13px] leading-6 text-[#657a90]">{f.detail}</p><span className="mt-5 inline-flex items-center gap-2 text-[11px] font-black text-[#1d65d8] group-hover:underline">Explore feature <span aria-hidden="true">→</span></span>
          </a>)}
        </div>
        <p className="mt-5 text-xs leading-6 text-[#6e8296]">Feature availability depends on edition and verified deployment readiness.</p>
      </section>
      <section id="workflows" className="scroll-mt-28 border-y border-[#e4edfa] bg-[linear-gradient(180deg,#f8fbff,#eef5ff)]">
        <div className="mx-auto max-w-[1720px] px-5 py-14 sm:py-16 lg:px-9">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#1762df]">Built around the working day</p>
              <h2 className="mt-3 text-[clamp(1.75rem,2.65vw,2.8rem)] font-black leading-[1.17] tracking-[-0.04em] text-[#0c2750]">From your first sale to the<br/><span className="text-[#1761e9]">end-of-day report.</span></h2>
            </div>
            <p className="max-w-[485px] text-[13px] leading-7 text-[#587596]">See how everyday business tasks fit together — sales, purchases, customer work, services, stock and closing reports. Each example below uses illustrative data.</p>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {number:"01",time:"OPEN FOR BUSINESS",title:"Get your stock ready",detail:"Review product records, check availability and organize purchases before the rush.",icon:"box" as IconName},
              {number:"02",time:"BUSY SALES HOURS",title:"Create the next invoice",detail:"Handle products, services, payments and quotations in a structured sales workflow.",icon:"receipt" as IconName},
              {number:"03",time:"CUSTOMER & SERVICE WORK",title:"Keep each job moving",detail:"Register tailoring, laundry or field-service work and follow the order status.",icon:"tool" as IconName},
              {number:"04",time:"CLOSE THE DAY",title:"Review what changed",detail:"Look across expenses, sales, stock movements and business reports.",icon:"chart" as IconName},
            ].map(step=><article key={step.number} className="rounded-[18px] border border-[#d8e7fb] bg-white p-5 shadow-[0_8px_25px_rgba(33,93,163,.04)]">
              <div className="flex items-center justify-between"><span className="text-[11px] font-black tracking-[0.15em] text-[#2169d6]">{step.time}</span><span className="text-[20px] font-black text-[#bed5f6]">{step.number}</span></div>
              <span className="mt-4 grid size-11 place-items-center rounded-xl bg-[#e9f2ff] text-[#1461e5]"><Icon name={step.icon} className="size-6"/></span>
              <h3 className="mt-4 text-[16px] font-black text-[#153657]">{step.title}</h3>
              <p className="mt-2 text-[12px] leading-6 text-[#607b98]">{step.detail}</p>
            </article>)}
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <article className="overflow-hidden rounded-[21px] border border-[#d8e6fa] bg-white shadow-[0_12px_38px_rgba(21,79,157,.055)]">
              <div className="flex items-start justify-between gap-4 px-5 pt-6 sm:px-7"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#206ce0]">Billing and payments</p><h3 className="mt-2 text-xl font-black tracking-tight text-[#133459]">A cleaner checkout experience.</h3><p className="mt-2 max-w-md text-[13px] leading-6 text-[#66809a]">Products, quantities and service items can be reviewed together in an illustrative invoice view.</p></div><span className="hidden rounded-lg bg-[#eaf3ff] p-3 text-[#1764ea] sm:block"><Icon name="receipt" className="size-6"/></span></div>
              <div className="mx-5 mb-5 mt-5 overflow-hidden rounded-xl border border-[#dbe7f8] bg-[#f8fbff] sm:mx-7">
                <div className="flex items-center justify-between border-b border-[#e4ebf7] bg-white px-4 py-3"><span className="text-[12px] font-extrabold text-[#264369]">Sample invoice · INV-DEMO-001</span><span className="rounded-md bg-[#e7f6ee] px-2 py-1 text-[10px] font-bold text-[#178451]">Preview</span></div>
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-[#dfeafa] px-4 py-2 text-[10px] font-black uppercase tracking-wider text-[#8194ab]"><span>Product / service</span><span>Qty</span><span>Amount</span></div>
                {([{name:"Cotton fabric",qty:"2 m",price:"₹900"},{name:"Tailoring service",qty:"1",price:"₹350"},{name:"Canvas tote bag",qty:"1",price:"₹299"}] as const).map(line=><div key={line.name} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-[#e8eff9] bg-white px-4 py-3 text-[12px] text-[#445d7c]"><span className="font-semibold">{line.name}</span><span>{line.qty}</span><span className="font-extrabold text-[#214b8a]">{line.price}</span></div>)}
                <div className="flex items-center justify-between px-4 py-3 text-[13px]"><span className="font-bold text-[#647b99]">Sample subtotal</span><strong className="text-[17px] text-[#175de0]">₹1,549</strong></div>
              </div>
            </article>
            <article className="overflow-hidden rounded-[21px] border border-[#d8e6fa] bg-white shadow-[0_12px_38px_rgba(21,79,157,.055)]">
              <div className="flex items-start justify-between gap-4 px-5 pt-6 sm:px-7"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#206ce0]">Service & customer orders</p><h3 className="mt-2 text-xl font-black tracking-tight text-[#133459]">Know the next step for every job.</h3><p className="mt-2 max-w-md text-[13px] leading-6 text-[#66809a]">A structured workflow for service registrations, technician allocations and order follow-up.</p></div><span className="hidden rounded-lg bg-[#eaf3ff] p-3 text-[#1764ea] sm:block"><Icon name="tool" className="size-6"/></span></div>
              <div className="mx-5 mb-5 mt-5 overflow-hidden rounded-xl border border-[#dbe7f8] bg-[#f8fbff] sm:mx-7">
                <div className="flex items-center justify-between border-b border-[#e4ebf7] bg-white px-4 py-3"><span className="text-[12px] font-extrabold text-[#264369]">Sample service tracker</span><span className="text-[10px] font-bold text-[#7893b1]">Job progress</span></div>
                {[
                  {name:"Laptop service",code:"SRV-101",status:"Registered",tone:"bg-[#ebf2ff] text-[#2262d3]"},
                  {name:"CCTV camera check",code:"SRV-102",status:"Assigned",tone:"bg-[#fff4df] text-[#ab7016]"},
                  {name:"Alteration pickup",code:"SRV-103",status:"Completed",tone:"bg-[#e8f7ee] text-[#19824d]"},
                ].map(job=><div key={job.code} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e8eff9] bg-white px-4 py-3">
                  <div><strong className="text-[12px] text-[#26476b]">{job.name}</strong><span className="ml-2 text-[10px] text-[#869bb2]">{job.code}</span></div><span className={"rounded-full px-3 py-1 text-[10px] font-bold "+job.tone}>{job.status}</span>
                </div>)}
                <div className="flex items-center justify-between gap-2 px-4 py-3 text-[10px] font-extrabold text-[#3970b4]"><span>Register</span><Icon name="arrow" className="size-4"/><span>Assign</span><Icon name="arrow" className="size-4"/><span>Complete</span></div>
              </div>
            </article>
          </div>
          <p className="mt-5 text-[11px] leading-5 text-[#6f88a7]">These are illustrative examples — not screenshots of a verified customer account. Availability of notifications and integrations depends on deployment readiness.</p>
        </div>
      </section>
      <section id="industries" className="scroll-mt-28 border-y border-[#e6eef9] bg-[#f3f8ff]">
        <div className="mx-auto max-w-[1720px] px-5 py-14 sm:py-16 lg:px-9">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#1661e6]">Designed around your work</p><h2 className="mt-3 text-[clamp(1.75rem,2.65vw,2.8rem)] font-black tracking-[-0.04em] text-[#0d2a4d] sm:text-5xl">Perfect for different<br/><span className="text-[#1765ee]">types of businesses.</span></h2></div>
            <p className="max-w-sm text-sm leading-7 text-[#627893]">One platform direction, with workflows for retail, specialized orders and services.</p>
          </div>
          <div className="mt-11 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {industries.map(ind=><a key={ind.slug} href={"/industries/"+ind.slug} aria-label={"Explore "+ind.title+" workflows"} className="group overflow-hidden rounded-[19px] border border-[#dbe7f5] bg-white shadow-[0_5px_20px_rgba(24,69,109,.045)] transition hover:-translate-y-1 hover:border-[#9ac2fb] hover:shadow-[0_14px_32px_rgba(24,69,109,.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#145fec]">
              <div className={"relative grid h-28 place-items-center overflow-hidden bg-gradient-to-br "+ind.accent}>
                <span className="absolute -bottom-10 -right-5 size-32 rounded-full border-[20px] border-white/25" aria-hidden="true"/>
                <span className="absolute -left-6 top-5 size-20 rounded-full bg-white/25 blur-md" aria-hidden="true"/>
                <span className="relative grid size-16 place-items-center rounded-[20px] border border-white/80 bg-white/60 text-[#205390] shadow-xl shadow-[#375b8820]"><Icon name={ind.icon} className="size-9"/></span>
                <span className="absolute bottom-2 left-3 text-[9px] font-bold uppercase tracking-widest text-[#365878]">{ind.scene}</span>
              </div>
              <div className="px-4 py-5"><h3 className="text-[13px] font-extrabold text-[#162f51]">{ind.title}</h3><p className="mt-2 text-[11px] leading-[1.7] text-[#6c8099]">{ind.description}</p><span className="mt-4 inline-flex items-center gap-2 text-[11px] font-extrabold text-[#1660de] group-hover:underline">Explore workflow <span aria-hidden="true">→</span></span></div>
            </a>)}
          </div>
          <p className="mt-6 text-xs text-[#6683a1]">Illustrative industry graphics; these are not photographs of customer premises.</p>
        </div>
      </section>
      <section id="product-tour" className="scroll-mt-28 mx-auto max-w-[1720px] px-5 py-14 sm:py-16 lg:px-9">
        <ProductTourClient />
      </section>
      <section id="editions" className="scroll-mt-28 bg-[linear-gradient(135deg,#0c2b54,#0b3e83)] text-white">
        <div className="mx-auto max-w-[1720px] px-5 py-14 sm:py-16 lg:px-9">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#a8d2ff]">One platform. Your way.</p>
          <h2 className="mt-3 text-[clamp(1.75rem,2.65vw,2.8rem)] font-black tracking-[-0.04em] sm:text-5xl">Choose how you work.</h2>
          <p className="mt-5 max-w-2xl text-sm leading-8 text-[#c8dcf4]">A connected core designed for the different ways your business runs. Cross-edition acceptance remains ongoing.</p>
          <div className="mt-11 grid gap-4 lg:grid-cols-3">
            {[
              {name:"Online",sub:"WORK IN YOUR BROWSER",desc:"Reach your authenticated business workspace in a supported browser.",details:["Connected business modules","Role-based access","Account-based workflows"],icon:"cloud" as IconName},
              {name:"Windows Offline",sub:"LOCAL-FIRST DESKTOP",desc:"Use supported local workflows even when the connection is unavailable.",details:["Windows desktop application","Local operational records","Published installer releases"],icon:"monitor" as IconName},
              {name:"Hybrid",sub:"WORK ACROSS BOTH",desc:"Bring supported local-first processes and cloud synchronization together.",details:["Shared product foundation","Online and offline workflows","Sync acceptance in progress"],icon:"smartphone" as IconName},
            ].map((ed,i)=><article key={ed.name} className={"flex flex-col rounded-[22px] border p-7 sm:p-8 "+(i===1?"border-[#66a7f9] bg-white text-[#12365d] shadow-[0_20px_55px_rgba(0,0,0,.19)]":"border-white/20 bg-white/10 text-white")}>
              <span className={"grid size-12 place-items-center rounded-2xl "+(i===1?"bg-[#e3efff] text-[#1260e5]":"bg-white/15 text-white")}><Icon name={ed.icon} className="size-6"/></span>
              <p className={"mt-6 text-[10px] font-black uppercase tracking-widest "+(i===1?"text-[#1466dc]":"text-[#bcdcff]")}>{ed.sub}</p>
              <h3 className="mt-2 text-2xl font-black tracking-tight">{ed.name}</h3>
              <p className={"mt-4 min-h-16 text-sm leading-7 "+(i===1?"text-[#55718d]":"text-[#c9dced]")}>{ed.desc}</p>
              <ul className={"mt-6 space-y-3 border-t pt-6 text-[13px] "+(i===1?"border-[#e1eaf6]":"border-white/15")}>
                {ed.details.map(v=><li key={v} className="flex items-center gap-2.5"><Icon name="check" className={"size-4 "+(i===1?"text-[#0aa777]":"text-[#9fefc7]")}/>{v}</li>)}
              </ul>
            </article>)}
          </div>
          <p className="mt-6 text-xs leading-6 text-[#c5dcf5]">The evaluation period is 30 days. Public pricing and self-service trial activation are not yet available; eligibility and activation require verification.</p>
        </div>
      </section>
      <section id="download" className="scroll-mt-28 bg-[#eaf3ff]">
        <div className="mx-auto flex max-w-[1720px] flex-col items-start justify-between gap-6 px-5 py-14 sm:py-20 lg:flex-row lg:items-center lg:px-9">
          <div><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#1664eb]">Windows desktop edition</p><h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-[#0d2b55] sm:text-4xl">Explore Minarva Biz on Windows.</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-[#5b7393]">Official published installer: v1.0.15. Review the release notes and assets before installation; customer onboarding and Hybrid acceptance are still being verified.</p></div>
          <a href={releaseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#1461ee] px-7 py-4 text-sm font-extrabold text-white shadow-[0_14px_25px_rgba(12,77,193,.18)] transition hover:bg-[#0c50ce]">View official Windows release <Icon name="arrow" className="size-4"/></a>
        </div>
      </section>
      <section id="faq" className="scroll-mt-28 mx-auto grid max-w-[1720px] gap-10 px-5 py-20 sm:py-24 lg:grid-cols-[0.7fr_1fr] lg:px-9">
        <div><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#1562e9]">Good to know</p><h2 className="mt-3 text-[clamp(1.75rem,2.65vw,2.8rem)] font-black tracking-[-0.04em] text-[#102a4c] sm:text-5xl">Questions,<br/>answered.</h2><p className="mt-5 max-w-xs text-sm leading-7 text-[#687f96]">Clear information about access, readiness and download options.</p></div>
        <div className="divide-y divide-[#e1e9f5] border-y border-[#e1e9f5]">
          {faqs.map(q=><details key={q.question} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-5 rounded-md text-[15px] font-extrabold text-[#1b3559] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1661ee] [&::-webkit-details-marker]:hidden"><span>{q.question}</span><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#edf4ff] text-lg font-normal text-[#1661ee] transition group-open:rotate-45" aria-hidden="true">+</span></summary>
            <p className="mt-4 max-w-2xl pr-9 text-sm leading-7 text-[#647d95]">{q.answer}</p>
          </details>)}
        </div>
      </section>
    </main>
    <footer className="border-t border-[#dce8f6] bg-[#f4f8ff]">
      <div className="mx-auto grid max-w-[1720px] gap-8 px-5 py-12 lg:grid-cols-[1fr_auto] lg:px-9">
        <div><Logo/><p className="mt-5 max-w-md text-sm leading-7 text-[#67809b]">Business management built around everyday work. Current product availability and acceptance are being verified.</p></div>
        <nav aria-label="Footer navigation" className="flex flex-wrap items-start gap-5 text-xs font-bold text-[#3c6084]">
          <a href="#product-tour" className="hover:text-[#175ce5]">Product tour</a><a href="#features" className="hover:text-[#175ce5]">Features</a><a href="#editions" className="hover:text-[#175ce5]">Editions</a><a href="/login" className="hover:text-[#175ce5]">Customer login</a><a href={releaseUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#175ce5]">Windows release</a>
        </nav>
      </div>
      <nav aria-label="Industry guides" className="mx-auto flex max-w-[1720px] flex-wrap items-center gap-x-5 gap-y-3 border-t border-[#dce8f6] px-5 py-5 text-[11px] lg:px-9">
        <span className="font-black uppercase tracking-wide text-[#6b85a5]">Browse industries</span>
        {industries.map(ind=><a key={ind.slug} href={"/industries/"+ind.slug} className="font-semibold text-[#315a89] hover:text-[#175de2] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1562ee]">{ind.title}</a>)}
      </nav>
      <nav aria-label="Feature guides" className="mx-auto flex max-w-[1720px] flex-wrap items-center gap-3 border-t border-[#dce8f6] px-5 py-4 text-[11px] font-bold lg:px-9">
        <span className="text-[#6683a2]">Explore features</span>
        {features.map(item=><a key={item.slug} href={"/features/"+item.slug} className="text-[#245897] hover:text-[#145de4] hover:underline">{item.title}</a>)}
      </nav>
      <div className="mx-auto flex max-w-[1720px] flex-col justify-between gap-3 border-t border-[#dce8f6] px-5 py-5 text-[11px] text-[#6682a0] sm:flex-row lg:px-9"><span>© Minarva Biz · A connected business platform.</span><span>Online · Windows Offline · Hybrid</span></div>
    </footer>
  </div>;
}
