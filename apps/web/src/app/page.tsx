import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Minarva Biz | Billing, Inventory & Business Management",
  description:
    "Discover Minarva Biz business software for billing, inventory, accounting, services and retail operations. Explore Online, Windows and Hybrid experiences.",
  robots: { index: true, follow: true },
};

const capabilities = [
  { title: "Billing & POS", description: "Invoices, quotations, point of sale, returns and printing.", symbol: "01" },
  { title: "Inventory & Purchasing", description: "Products, stock movement, suppliers, purchasing and barcodes.", symbol: "02" },
  { title: "Accounts & Expenses", description: "Track payments, expenses, receivables and operational reports.", symbol: "03" },
  { title: "Customers & Services", description: "Customer records, orders, tailoring, laundry and service workflows.", symbol: "04" },
  { title: "Team & Branches", description: "Role-aware operations across staff, locations and business units.", symbol: "05" },
  { title: "Windows, Online & Hybrid", description: "A shared product foundation with local-first desktop workflows.", symbol: "06" },
] as const;

const industries = ["Retail & wholesale", "Boutiques & tailoring", "Laundry & ironing", "Field services", "Multi-branch businesses"];

const navigation = [
  { title: "Features", href: "#features" },
  { title: "Industries", href: "#industries" },
  { title: "Editions", href: "#editions" },
  { title: "Download", href: "#download" },
  { title: "FAQ", href: "#faq" },
] as const;

const releaseUrl = "https://github.com/evertekitsolutions-del/minarvabiz/releases/tag/v1.0.15";

function Wordmark() {
  return (
    <a href="/" aria-label="Minarva Biz home" className="inline-flex items-center gap-3 font-semibold tracking-tight">
      <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-lg font-black text-white">M</span>
      <span className="text-xl text-slate-950">Minarva <span className="text-indigo-600">Biz</span></span>
    </a>
  );
}

export default function PublicHomePage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-4">Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Wordmark />
          <nav aria-label="Main navigation" className="order-3 flex w-full flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-slate-600 lg:order-2 lg:w-auto">
            {navigation.map((item) => <a key={item.href} className="transition hover:text-indigo-700 focus-visible:underline" href={item.href}>{item.title}</a>)}
          </nav>
          <a href="/login" className="order-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 lg:order-3">Customer login <span aria-hidden="true">→</span></a>
        </div>
      </header>

      <main id="main">
        <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
          <div aria-hidden="true" className="pointer-events-none absolute -right-32 top-0 size-96 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="mb-5 inline-flex rounded-full border border-indigo-300/30 bg-indigo-400/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-indigo-200">Business software built for real operations</p>
              <h1 className="max-w-2xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">Your business.<br/><span className="text-indigo-300">One connected platform.</span></h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-slate-300">Manage billing, inventory, purchasing, customers and day-to-day operations with Minarva Biz. Explore a shared foundation for Online, Windows Offline and Hybrid working.</p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href="#features" className="rounded-xl bg-indigo-500 px-6 py-3.5 font-semibold text-white transition hover:bg-indigo-400">Explore features <span aria-hidden="true">→</span></a>
                <a href="#download" className="rounded-xl border border-white/30 px-6 py-3.5 font-semibold text-white transition hover:bg-white/10">Get Windows release</a>
              </div>
              <p className="mt-6 text-sm text-slate-400">New customer self-service signup and trial activation are being prepared. No default login credentials are issued.</p>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-5 shadow-2xl backdrop-blur sm:p-7" aria-label="Illustration of the platform's operational areas">
              <div className="flex items-center justify-between border-b border-white/15 pb-5"><span className="text-sm font-semibold">One business workspace</span><span className="rounded-full bg-indigo-400/20 px-3 py-1 text-xs text-indigo-100">Platform overview</span></div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                {["Sales & billing", "Inventory", "Customers", "Purchases", "Expenses", "Reporting"].map((module, index) => (
                  <div key={module} className="rounded-2xl border border-white/10 bg-slate-900/65 p-5">
                    <span className="text-xs text-indigo-300">MODULE {String(index + 1).padStart(2, "0")}</span>
                    <p className="mt-4 text-sm font-semibold text-white">{module}</p>
                    <span aria-hidden="true" className="mt-3 block h-1.5 w-12 rounded-full bg-indigo-400/70" />
                  </div>
                ))}
              </div>
              <p className="mt-5 text-xs text-slate-300">Conceptual module overview — not an application screenshot or demonstration.</p>
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-24 mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Capabilities</p>
          <h2 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">Tools for the work behind every sale.</h2>
          <p className="mt-4 max-w-2xl text-slate-600">Discover the product areas available in the shared Minarva Biz platform. Edition and deployment availability can vary.</p>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((feature) => <article key={feature.title} className="rounded-2xl border border-slate-200 p-7 shadow-sm transition hover:border-indigo-200 hover:shadow-md">
              <span className="text-sm font-bold text-indigo-600">{feature.symbol}</span>
              <h3 className="mt-5 text-xl font-bold">{feature.title}</h3>
              <p className="mt-3 leading-7 text-slate-600">{feature.description}</p>
            </article>)}
          </div>
        </section>

        <section id="industries" className="scroll-mt-24 bg-slate-50">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
            <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Industries</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Adaptable to different businesses.</h2>
            <div className="mt-9 flex flex-wrap gap-3">{industries.map((industry) => <span key={industry} className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700">{industry}</span>)}</div>
            <p className="mt-7 text-sm text-slate-600">Industry-specific capabilities and country compliance are subject to edition readiness and verification.</p>
          </div>
        </section>

        <section id="editions" className="scroll-mt-24 mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Editions and access</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Choose how you work.</h2>
          <div className="mt-9 grid gap-5 md:grid-cols-3">
            {[
              { name: "Online", text: "Browser-based access to your authenticated business workspace." },
              { name: "Windows Offline", text: "Desktop workflows designed for continuity when your connection is unavailable." },
              { name: "Hybrid", text: "Combine local-first operation with supported cloud synchronization workflows." },
            ].map((edition) => <article key={edition.name} className="rounded-2xl border border-slate-200 p-7">
              <h3 className="text-xl font-bold">{edition.name}</h3><p className="mt-3 leading-7 text-slate-600">{edition.text}</p>
            </article>)}
          </div>
          <div className="mt-8 rounded-xl border border-indigo-100 bg-indigo-50 p-5 text-sm leading-7 text-slate-700">
            <strong>Pricing and trials:</strong> Published public prices and automatic customer trial activation are not yet available. We will show verified plans and trial eligibility here before accepting self-service registrations.
          </div>
        </section>

        <section id="download" className="scroll-mt-24 bg-slate-950 text-white">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-16 sm:px-8 md:flex-row md:items-center md:justify-between">
            <div><p className="text-sm font-bold uppercase tracking-widest text-indigo-300">Windows download</p><h2 className="mt-3 text-3xl font-bold">Minarva Biz for Windows</h2><p className="mt-3 max-w-xl text-slate-300">Published installer release v1.0.15. Access the official GitHub Release page to review and download its published assets.</p></div>
            <a href={releaseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center justify-center rounded-xl bg-indigo-500 px-6 py-4 font-semibold text-white hover:bg-indigo-400">View official release <span className="ml-2" aria-hidden="true">↗</span></a>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 mx-auto max-w-4xl px-5 py-20 sm:px-8">
          <h2 className="text-3xl font-bold tracking-tight">Frequently asked questions</h2>
          <div className="mt-8 divide-y divide-slate-200 rounded-2xl border border-slate-200 px-6">
            {[
              ["Can I use Minarva Biz without internet?", "The Windows desktop architecture supports local-first operations. Cloud synchronization and specific online functions require connectivity."],
              ["Can I register a new account now?", "Self-service customer registration and automated trial activation are under development. Existing authorized users can use Customer login."],
              ["Where can I download the desktop installer?", "The Download section opens the official published GitHub v1.0.15 Release page. Check its assets and release notes before installation."],
              ["Does every industry module work in every edition?", "No universal availability claim is made. Modules are being verified individually for Online, Offline and Hybrid readiness."],
            ].map(([question, answer]) => <details key={question} className="group py-5"><summary className="cursor-pointer font-semibold text-slate-900 marker:text-indigo-600">{question}</summary><p className="mt-3 pb-1 leading-7 text-slate-600">{answer}</p></details>)}
          </div>
        </section>
      </main>

      <footer id="contact" className="scroll-mt-24 border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-7 px-5 py-10 sm:px-8 md:flex-row">
          <div><Wordmark /><p className="mt-3 max-w-md text-sm leading-6 text-slate-600">Business management for ambitious teams. Support, privacy and documentation resources will be published as they are verified.</p></div>
          <div className="flex flex-wrap items-start gap-5 text-sm font-semibold text-slate-700">
            <a href="/login" className="hover:text-indigo-700">Customer login</a>
            <a href={releaseUrl} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-700">Official release</a>
            <a href="https://github.com/evertekitsolutions-del/minarvabiz/issues" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-700">Project support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
