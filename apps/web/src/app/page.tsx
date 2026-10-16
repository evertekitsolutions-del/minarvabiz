import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Minarva Biz | A Smarter Way to Run Your Business",
  description:
    "Explore Minarva Biz: a connected business workspace for sales, inventory, purchasing, accounts, services and teams, designed for browser, Windows and hybrid operations.",
  robots: { index: true, follow: true },
};

const releaseUrl = "https://github.com/evertekitsolutions-del/minarvabiz/releases/tag/v1.0.15";

const navigation = [
  { title: "Features", href: "#features" },
  { title: "Industries", href: "#industries" },
  { title: "Editions", href: "#editions" },
  { title: "Download", href: "#download" },
  { title: "FAQ", href: "#faq" },
] as const;

const capabilities = [
  {
    number: "01", title: "Billing & POS", category: "SELL",
    description: "Create sales, invoices, quotations and returns with a practical point-of-sale workflow.",
    icon: "receipt",
  },
  {
    number: "02", title: "Inventory & Purchasing", category: "ORGANIZE",
    description: "Keep products, purchases, suppliers and stock movement in one connected workflow.",
    icon: "package",
  },
  {
    number: "03", title: "Accounts & Expenses", category: "UNDERSTAND",
    description: "Track money moving through your business, from expenses to customer and supplier balances.",
    icon: "wallet",
  },
  {
    number: "04", title: "Customers & Services", category: "DELIVER",
    description: "Manage customer records, service orders, tailoring and laundry work alongside sales.",
    icon: "users",
  },
  {
    number: "05", title: "Team & Branches", category: "COLLABORATE",
    description: "Support staff roles, assignments and operations across different business locations.",
    icon: "grid",
  },
  {
    number: "06", title: "Reports & Operations", category: "IMPROVE",
    description: "Connect everyday transactions with operational views and management reporting.",
    icon: "chart",
  },
] as const;

const industries = [
  { title: "Retail & wholesale", detail: "From counter sales to stock and supplier management", number: "01" },
  { title: "Boutiques & tailoring", detail: "Products, measurements, orders and fulfillment", number: "02" },
  { title: "Laundry & ironing", detail: "Ticket-based service tracking and handover", number: "03" },
  { title: "Field services", detail: "Service registration, assignments and follow-up", number: "04" },
  { title: "Multi-branch operations", detail: "Teams, locations and shared business processes", number: "05" },
] as const;

const editions = [
  {
    name: "Online",
    kicker: "WORK IN YOUR BROWSER",
    description: "Open your authenticated business workspace in a modern web browser.",
    points: ["Browser-based access", "Connected business modules", "Account-based permissions"],
  },
  {
    name: "Windows Offline",
    kicker: "KEEP WORK MOVING",
    description: "Use local-first desktop workflows designed for times when your connection is unavailable.",
    points: ["Windows desktop experience", "Local operational workflows", "Published installer releases"],
  },
  {
    name: "Hybrid",
    kicker: "BRIDGE BOTH WORLDS",
    description: "Bring local operations and supported cloud synchronization into one product architecture.",
    points: ["Offline and online workflows", "Shared product foundation", "Synchronization under acceptance testing"],
  },
] as const;

const faqs = [
  {
    question: "Can I use Minarva Biz without an internet connection?",
    answer: "The Windows edition is designed for local-first use. Features that depend on cloud services or synchronization need a connection. Real-customer Offline/Hybrid acceptance is still in progress.",
  },
  {
    question: "Is online registration available?",
    answer: "Self-service signup and automatic trial activation are being prepared. Existing authorized users can select Customer login; no demo credentials are provided.",
  },
  {
    question: "Where can I get the Windows app?",
    answer: "The Download section links to the official v1.0.15 GitHub release. Check the published installer assets and release notes before installation.",
  },
  {
    question: "Are all features available for every industry and edition?",
    answer: "Availability depends on the module, edition and its acceptance status. Industry and country-specific workflows are being verified; this website does not imply universal production readiness.",
  },
] as const;

function Mark({ inverse = false }: { inverse?: boolean }) {
  return (
    <a
      href="/"
      aria-label="Minarva Biz home"
      className="inline-flex items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-500"
    >
      <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-2xl bg-[#0c2930] text-xl font-black tracking-[-0.12em] text-[#c9e5b8] shadow-[0_8px_20px_rgba(4,28,33,0.12)]">
        M
      </span>
      <span className={"text-[1.25rem] font-extrabold tracking-[-0.045em] " + (inverse ? "text-white" : "text-[#102b33]")}>
        Minarva<span className="ml-1 text-[#14856b]">Biz</span>
      </span>
    </a>
  );
}

function ArrowIcon({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg aria-hidden="true" className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {diagonal ? <path d="M5 19 19 5M7 5h12v12" /> : <path d="M4 12h15m-6-6 6 6-6 6" />}
    </svg>
  );
}

function FeatureIcon({ kind }: { kind: (typeof capabilities)[number]["icon"] }) {
  const paths = {
    receipt: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></>,
    package: <><path d="m3 7 9-4 9 4v10l-9 4-9-4V7Z" /><path d="m3 7 9 4 9-4M12 11v10M7.5 5l9 4" /></>,
    wallet: <><rect x="3" y="6" width="18" height="15" rx="3" /><path d="M3 10h18M7 6V4a1 1 0 0 1 1-1h10" /><path d="M16 15h2" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5v1" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    chart: <><path d="M4 20h16M6 16l5-5 4 3 4-7" /><path d="M16 7h3v3" /></>,
  };
  return (
    <svg aria-hidden="true" className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round">
      {paths[kind]}
    </svg>
  );
}

function WorkspaceIllustration() {
  const bars = [32, 54, 43, 70, 60, 88, 77, 100, 79, 92];
  return (
    <div className="relative mx-auto w-full max-w-[570px]" aria-label="Conceptual interface illustration; not a live application screenshot">
      <div aria-hidden="true" className="absolute -inset-5 rounded-[3rem] bg-[#b5d3c3]/20 blur-3xl" />
      <div className="relative overflow-hidden rounded-[1.7rem] border border-white/15 bg-[#f9faf7] text-[#102b33] shadow-[0_35px_90px_rgba(0,11,17,0.32)] sm:rounded-[2rem]">
        <div className="flex items-center justify-between border-b border-[#e7ebe5] bg-white px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="grid size-8 place-items-center rounded-xl bg-[#0b333c] text-sm font-black text-[#bfe5c4]">M</span>
            <span className="text-sm font-extrabold tracking-tight">Business overview</span>
          </div>
          <span className="rounded-full bg-[#eaf4e9] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#28775e]">Illustration</span>
        </div>
        <div className="grid grid-cols-[68px_minmax(0,1fr)] sm:grid-cols-[112px_minmax(0,1fr)]">
          <div className="border-r border-[#e7ebe5] bg-[#f0f3ef] px-2 py-5 sm:px-3">
            {["Overview", "Sales", "Stock", "Orders", "Reports"].map((item, index) => (
              <div key={item} className={"mb-2 flex items-center gap-2 rounded-lg px-2 py-2.5 " + (index === 0 ? "bg-[#dcece1] text-[#17634f]" : "text-[#7b8b88]")}>
                <span aria-hidden="true" className={"block size-2 rounded-full " + (index === 0 ? "bg-[#14856b]" : "bg-[#b7c7c0]")} />
                <span className="hidden text-[11px] font-semibold sm:block">{item}</span>
              </div>
            ))}
          </div>
          <div className="min-w-0 p-3 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div><p className="text-[10px] font-semibold uppercase tracking-widest text-[#7d9188]">Your workspace</p><h3 className="mt-1 text-base font-bold sm:text-xl">At a glance</h3></div>
              <span className="rounded-lg border border-[#e4eae3] bg-white px-2.5 py-2 text-[10px] font-semibold text-[#5c746e]">All modules</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {[
                ["Sales", "Invoices & POS"],
                ["Inventory", "Stock & products"],
                ["Services", "Customer orders"],
                ["Accounts", "Money in & out"],
              ].map(([name, note], index) => (
                <div key={name} className="rounded-xl border border-[#e5eae4] bg-white p-3 sm:p-4">
                  <span aria-hidden="true" className={"mb-3 block size-2.5 rounded-full " + (index === 0 ? "bg-[#11876a]" : index === 1 ? "bg-[#cba96c]" : index === 2 ? "bg-[#5e82a1]" : "bg-[#aac79b]")} />
                  <p className="text-xs font-bold sm:text-sm">{name}</p>
                  <p className="mt-1 hidden text-[10px] text-[#71847d] sm:block">{note}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-[#e5eae4] bg-white p-3.5 sm:p-5">
              <div className="flex items-center justify-between"><p className="text-xs font-bold">Business activity</p><span className="text-[10px] text-[#81938b]">Illustrative</span></div>
              <div aria-hidden="true" className="mt-4 flex h-20 items-end gap-1.5 sm:h-24 sm:gap-2">
                {bars.map((height, index) => <span key={index} style={{ height: height + "%" }} className={"min-w-0 flex-1 rounded-t-md " + (index === 7 ? "bg-[#14856b]" : "bg-[#c7e0ce]")} />)}
              </div>
              <div className="mt-2 flex justify-between text-[9px] text-[#81938b]"><span>Operations</span><span>Overview only</span></div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-5 -left-3 hidden rounded-2xl border border-white/70 bg-white px-4 py-3 shadow-[0_15px_40px_rgba(3,18,21,0.2)] sm:flex sm:items-center sm:gap-3">
        <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-xl bg-[#e3f2e8] text-[#127558]"><FeatureIcon kind="grid" /></span>
        <span><strong className="block text-xs text-[#143b35]">One connected workspace</strong><small className="text-[11px] text-[#789087]">Designed around daily work</small></span>
      </div>
      <p className="mt-9 text-center text-xs leading-5 text-[#bbcbc5]">Conceptual product illustration — not a live dashboard or performance report.</p>
    </div>
  );
}

export default function PublicHomePage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#f8f7f2] text-[#102b33]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:text-[#102b33]">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-[#dfe8df] bg-[#f8f7f2]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <Mark />
          <nav aria-label="Main navigation" className="order-3 hidden items-center gap-7 text-[13px] font-semibold text-[#536963] lg:order-2 lg:flex">
            {navigation.map((item) => <a key={item.href} href={item.href} className="rounded-md transition hover:text-[#138367] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#138367]">{item.title}</a>)}
          </nav>
          <a href="/login" className="order-2 inline-flex items-center gap-2 rounded-full bg-[#10333b] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#166251] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#138367] sm:px-5 sm:text-sm lg:order-3">
            Customer login <ArrowIcon diagonal />
          </a>
          <details className="group order-4 w-full lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-[#dce7dd] bg-white px-4 py-3 text-sm font-semibold text-[#1c3b3d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#138367] [&::-webkit-details-marker]:hidden">
              <span>Browse sections</span>
              <span aria-hidden="true" className="transition-transform group-open:rotate-180">⌄</span>
            </summary>
            <nav aria-label="Mobile navigation" className="mt-2 grid gap-1 rounded-xl border border-[#dce7dd] bg-white p-2 shadow-lg">
              {navigation.map((item) => <a key={item.href} href={item.href} className="rounded-lg px-3 py-3 text-sm font-semibold text-[#345854] transition hover:bg-[#e8f3ea] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#138367]">{item.title}</a>)}
            </nav>
          </details>
        </div>
      </header>

      <main id="main">
        <section className="relative isolate overflow-hidden bg-[#0c2930] text-white">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-50" style={{ backgroundImage: "radial-gradient(circle at 75% 15%, rgba(41,126,105,.44), transparent 37%), radial-gradient(circle at 0% 90%, rgba(21,72,85,.6), transparent 45%)" }} />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)", backgroundSize: "70px 70px" }} />
          <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[0.92fr_1.08fr] lg:gap-12 lg:py-28">
            <div>
              <p className="inline-flex items-center gap-2.5 rounded-full border border-[#4b8277] bg-white/[0.06] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.19em] text-[#d4ead1]">
                <span aria-hidden="true" className="size-2 rounded-full bg-[#a0d8a4]" /> Business made more manageable
              </p>
              <h1 className="mt-8 max-w-[630px] text-[clamp(3.1rem,6vw,5.7rem)] font-extrabold leading-[1.065] tracking-[-0.065em]">
                Less busywork.<br /><span className="text-[#bee1ae]">More business.</span>
              </h1>
              <p className="mt-7 max-w-[520px] text-base leading-8 text-[#c2d2ce] sm:text-lg">
                Billing, inventory, customers, accounts and everyday operations — brought together in one thoughtfully designed business platform.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href="#features" className="inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-[#c8e9b6] px-6 py-3.5 text-sm font-bold text-[#11382e] transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c8e9b6]">
                  Explore the platform <ArrowIcon />
                </a>
                <a href="#download" className="inline-flex min-h-12 items-center justify-center gap-3 rounded-full border border-[#739189] px-6 py-3.5 text-sm font-bold text-white transition hover:border-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
                  Windows download <ArrowIcon diagonal />
                </a>
              </div>
              <p className="mt-8 max-w-lg text-xs leading-6 text-[#a9bfb9]">
                Built around Online, Windows Offline and Hybrid workflows. Self-service signup and some commercial acceptance steps are still in progress.
              </p>
            </div>
            <WorkspaceIllustration />
          </div>
          <div className="relative border-t border-white/10 bg-[#09262c]/50">
            <div className="mx-auto grid max-w-7xl gap-5 px-5 py-6 text-[11px] font-bold uppercase tracking-[0.14em] text-[#adcac2] sm:grid-cols-3 sm:px-8">
              <span className="flex items-center gap-3"><span aria-hidden="true" className="size-1.5 rounded-full bg-[#b9ddad]" /> Connected business workflows</span>
              <span className="flex items-center gap-3"><span aria-hidden="true" className="size-1.5 rounded-full bg-[#b9ddad]" /> Local-first architecture</span>
              <span className="flex items-center gap-3"><span aria-hidden="true" className="size-1.5 rounded-full bg-[#b9ddad]" /> Designed to grow with you</span>
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-28 mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#168466]">Everything in its place</p>
              <h2 className="mt-5 max-w-2xl text-4xl font-extrabold leading-[1.12] tracking-[-0.05em] sm:text-5xl">The tools behind<br />a better workday.</h2>
            </div>
            <p className="max-w-sm text-sm leading-7 text-[#637971]">From the first customer interaction to the end-of-day overview, keep essential work connected.</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((feature) => (
              <article key={feature.title} className="group flex min-h-[255px] flex-col rounded-[1.55rem] border border-[#e0e8df] bg-white p-7 transition hover:-translate-y-1 hover:border-[#a6cbb6] hover:shadow-[0_18px_50px_rgba(15,58,47,0.08)]">
                <div className="flex items-start justify-between">
                  <span className="grid size-14 place-items-center rounded-2xl bg-[#e9f3e9] text-[#16765d]"><FeatureIcon kind={feature.icon} /></span>
                  <span className="text-xs font-bold tracking-[0.13em] text-[#a2b3aa]">{feature.number}</span>
                </div>
                <p className="mt-8 text-[10px] font-extrabold tracking-[0.19em] text-[#168466]">{feature.category}</p>
                <h3 className="mt-2 text-xl font-extrabold tracking-[-0.035em]">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[#647b72]">{feature.description}</p>
              </article>
            ))}
          </div>
          <p className="mt-6 text-xs leading-6 text-[#74877e]">Feature availability depends on edition, deployment and verified readiness.</p>
        </section>

        <section id="industries" className="scroll-mt-28 bg-[#e9eee6]">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#137d61]">Made for how you work</p>
              <h2 className="mt-5 max-w-md text-4xl font-extrabold leading-[1.13] tracking-[-0.05em] sm:text-5xl">Different businesses.<br />One foundation.</h2>
              <p className="mt-6 max-w-md text-sm leading-8 text-[#62796f]">A flexible business platform with room for the workflows that make your industry different.</p>
            </div>
            <div className="overflow-hidden rounded-[1.5rem] border border-[#d3dfd3] bg-[#f8f9f4]">
              {industries.map((industry) => (
                <article key={industry.title} className="grid grid-cols-[32px_1fr_auto] items-center gap-4 border-b border-[#dbe5da] px-5 py-6 last:border-b-0 sm:gap-6 sm:px-7">
                  <span className="self-start pt-1 text-xs font-bold text-[#91a99a]">{industry.number}</span>
                  <div><h3 className="text-lg font-extrabold tracking-tight sm:text-xl">{industry.title}</h3><p className="mt-2 text-xs leading-6 text-[#657c72] sm:text-sm">{industry.detail}</p></div>
                  <span aria-hidden="true" className="grid size-9 place-items-center rounded-full border border-[#c8dacb] text-[#24755f]"><ArrowIcon diagonal /></span>
                </article>
              ))}
            </div>
          </div>
          <p className="mx-auto max-w-7xl px-5 pb-12 text-xs leading-6 text-[#657c72] sm:px-8">Industry-specific capabilities and legal/compliance features are subject to edition readiness and verification.</p>
        </section>

        <section id="editions" className="scroll-mt-28 mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28">
          <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#168466]">Your business, your way</p>
          <h2 className="mt-5 text-4xl font-extrabold tracking-[-0.05em] sm:text-5xl">Work where it works for you.</h2>
          <p className="mt-5 max-w-2xl text-sm leading-8 text-[#637971]">One product direction, with multiple ways to access your operational workspace.</p>
          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {editions.map((edition, index) => (
              <article key={edition.name} className={"flex h-full flex-col rounded-[1.6rem] border p-7 sm:p-8 " + (index === 1 ? "border-[#0c3035] bg-[#0c3035] text-white" : "border-[#dce6dd] bg-white")}>
                <p className={"text-[10px] font-extrabold uppercase tracking-[0.18em] " + (index === 1 ? "text-[#c2dfb4]" : "text-[#188163]")}>{edition.kicker}</p>
                <h3 className="mt-8 text-2xl font-extrabold tracking-[-0.04em]">{edition.name}</h3>
                <p className={"mt-4 min-h-[85px] text-sm leading-7 " + (index === 1 ? "text-[#c0d4ce]" : "text-[#61776e]")}>{edition.description}</p>
                <ul className={"mt-6 space-y-4 border-t pt-6 text-sm " + (index === 1 ? "border-white/15 text-[#e1eee7]" : "border-[#e3ebe3] text-[#355a4e]")}>
                  {edition.points.map((point) => <li key={point} className="flex items-start gap-3"><span aria-hidden="true" className={"mt-1 grid size-4 shrink-0 place-items-center rounded-full text-[10px] " + (index === 1 ? "bg-[#bce1ae] text-[#083c31]" : "bg-[#dcefe1] text-[#196f55]")}>✓</span>{point}</li>)}
                </ul>
              </article>
            ))}
          </div>
          <div className="mt-6 rounded-[1.2rem] border border-[#d8e7d8] bg-[#ecf4e9] px-6 py-5 text-sm leading-7 text-[#34594c]">
            <strong>Plans & trials:</strong> Public pricing and self-service trial activation are not available yet. Verified plans and eligibility will be published before registrations open.
          </div>
        </section>

        <section id="download" className="scroll-mt-28 bg-[#0c2930] text-white">
          <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 px-5 py-16 sm:px-8 sm:py-20 lg:flex-row lg:items-center">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#bde2ad]">Windows desktop edition</p>
              <h2 className="mt-4 text-3xl font-extrabold tracking-[-0.05em] sm:text-4xl">Ready to explore on Windows?</h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#bed1ca]">Published installer: v1.0.15. Open the official release to review available assets and release notes. Customer onboarding and Hybrid acceptance are still under verification.</p>
            </div>
            <a href={releaseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center justify-center gap-3 self-start rounded-full bg-[#c9e9b7] px-7 py-4 text-sm font-extrabold text-[#11372f] transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c9e9b7]">
              View official release <ArrowIcon diagonal />
            </a>
          </div>
        </section>

        <section id="faq" className="scroll-mt-28 mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[0.65fr_1fr] lg:gap-20">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#168466]">Good to know</p>
            <h2 className="mt-5 text-4xl font-extrabold tracking-[-0.05em] sm:text-5xl">Questions,<br />answered.</h2>
            <p className="mt-5 max-w-xs text-sm leading-8 text-[#637971]">Clear details about editions, account access and what's available today.</p>
          </div>
          <div className="divide-y divide-[#dce5d9] border-y border-[#dce5d9]">
            {faqs.map(({ question, answer }) => (
              <details key={question} className="group py-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-base font-bold tracking-tight text-[#153a3c] focus-visible:rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#168466] [&::-webkit-details-marker]:hidden">
                  <span>{question}</span>
                  <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-[#e4eee3] text-lg font-normal transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-4 max-w-2xl pr-9 text-sm leading-8 text-[#62796f]">{answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer id="contact" className="border-t border-[#dce6dd] bg-[#edf1e9]">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_auto] lg:gap-16">
          <div><Mark /><p className="mt-5 max-w-md text-sm leading-7 text-[#62786e]">Thoughtful business management for everyday operations. Product availability and verified support resources will be updated as delivery progresses.</p></div>
          <nav aria-label="Footer navigation" className="flex flex-wrap items-start gap-x-7 gap-y-4 text-sm font-bold text-[#34574e]">
            <a href="#features" className="hover:text-[#148466]">Features</a>
            <a href="#editions" className="hover:text-[#148466]">Editions</a>
            <a href="/login" className="hover:text-[#148466]">Customer login</a>
            <a href={releaseUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#148466]">Windows release</a>
            <a href="https://github.com/evertekitsolutions-del/minarvabiz/issues" target="_blank" rel="noopener noreferrer" className="hover:text-[#148466]">Project support</a>
          </nav>
        </div>
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 border-t border-[#d6e1d4] px-5 py-5 text-xs text-[#6e8377] sm:flex-row sm:px-8">
          <span>© Minarva Biz. Built for connected business operations.</span>
          <span>Online · Windows Offline · Hybrid</span>
        </div>
      </footer>
    </div>
  );
}
