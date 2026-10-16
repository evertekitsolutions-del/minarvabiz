import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findIndustryGuide, industryGuides } from "../industry-guides";

const releaseUrl = "https://github.com/evertekitsolutions-del/minarvabiz/releases/tag/v1.0.15";

type IndustryPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return industryGuides.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: IndustryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = findIndustryGuide(slug);
  if (!guide) return { title: "Industry not found | Minarva Biz", robots: { index: false, follow: false } };
  return {
    title: guide.title + " Business Management | Minarva Biz",
    description: guide.summary,
    robots: { index: true, follow: true },
  };
}

export default async function IndustryPage({ params }: IndustryPageProps) {
  const { slug } = await params;
  const guide = findIndustryGuide(slug);
  if (!guide) notFound();

  return (
    <div className="min-h-screen bg-white text-[#173452]">
      <a href="#industry-content" className="sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:not-sr-only focus:rounded-lg focus:bg-white focus:p-3 focus:text-[#1155da]">Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-[#e2eafb] bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1720px] flex-wrap items-center justify-between gap-3 px-5 py-3.5 lg:px-9">
          <a href="/" aria-label="Minarva Biz home" className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#135be8]">
            <img src="/minarva-biz-mark.svg" alt="" width={46} height={40} className="h-10 w-[46px] object-contain" decoding="async" />
            <strong className="text-[20px] font-black tracking-[-0.05em] text-[#0b2852]">Minarva <span className="text-[#1263ed]">Biz</span></strong>
          </a>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/#industries" className="inline-flex min-h-10 items-center rounded-xl border border-[#d1e0f7] px-3.5 text-xs font-bold text-[#1e5296] transition hover:bg-[#f2f7ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#135be8]">← All industries</a>
            <a href="/login" className="inline-flex min-h-10 items-center rounded-xl bg-[#1464ed] px-4 text-xs font-extrabold text-white transition hover:bg-[#0d51c9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#135be8]">Customer login</a>
          </div>
        </div>
      </header>

      <main id="industry-content">
        <section className="relative isolate overflow-hidden bg-[linear-gradient(112deg,#eaf4ff_0%,#f5f9ff_62%,#fff_100%)]">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-40 size-[550px] rounded-full bg-[#cde2ff]/60 blur-[90px]"/>
          <div className="relative mx-auto grid max-w-[1720px] items-center gap-9 px-5 py-12 lg:grid-cols-[1.1fr_.9fr] lg:px-9 lg:py-16">
            <div>
              <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap gap-2 text-[11px] font-bold text-[#597b9e]">
                <a href="/" className="hover:text-[#1763e7]">Home</a><span aria-hidden="true">/</span>
                <a href="/#industries" className="hover:text-[#1763e7]">Industries</a><span aria-hidden="true">/</span><span aria-current="page" className="text-[#155fdf]">{guide.title}</span>
              </nav>
              <p className="inline-flex rounded-full border border-[#cce1ff] bg-[#e0efff] px-3 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-[#195fda]">{guide.badge}</p>
              <h1 className="mt-5 max-w-3xl text-[clamp(2.15rem,3.4vw,3.6rem)] font-black leading-[1.12] tracking-[-0.055em] text-[#0e2a50]">{guide.title}<span className="block text-[#1766ed]">{guide.subtitle}</span></h1>
              <p className="mt-5 max-w-2xl text-[14px] leading-7 text-[#5b7594] sm:text-[15px]">{guide.summary}</p>
              <p className="mt-5 text-[12px] font-bold text-[#3e709d]">{guide.audience}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a href="#how-it-works" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#1463ef] px-6 py-3 text-sm font-extrabold text-white shadow-[0_12px_26px_rgba(19,89,216,.16)] transition hover:bg-[#0d50ce] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1463ef] focus-visible:outline-offset-2">Explore workflow ↓</a>
                <a href="/#product-tour" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#b8d3fa] bg-white px-6 py-3 text-sm font-bold text-[#1759c9] transition hover:bg-[#eaf3ff]">Try the sample product tour</a>
              </div>
            </div>
            <aside className="rounded-[23px] border border-[#d1e3fc] bg-white p-5 shadow-[0_23px_50px_rgba(23,77,145,.09)] sm:p-7" aria-label="Illustrative workflow overview">
              <div className="mb-6 flex items-center justify-between gap-3">
                <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#2770d5]">Illustrative workflow</p><h2 className="mt-2 text-xl font-black text-[#12375e]">A connected business day</h2></div>
                <span className="rounded-full bg-[#e7f7ef] px-3 py-1.5 text-[10px] font-bold text-[#19885b]">Sample</span>
              </div>
              <ol className="space-y-3">
                {guide.steps.map((step,index)=><li key={step.title} className="flex items-center gap-4 rounded-xl border border-[#dfebfa] bg-[#f8fbff] px-4 py-3.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#e3efff] text-[12px] font-black text-[#125bdc]">{String(index+1).padStart(2,"0")}</span>
                  <span className="text-[12px] font-extrabold text-[#25486e]">{step.title}</span>
                  <span aria-hidden="true" className="ml-auto text-[#72a5ee]">→</span>
                </li>)}
              </ol>
              <p className="mt-4 text-[11px] leading-5 text-[#7389a4]">Illustrative workflow only, not a live customer account or verified feature availability.</p>
            </aside>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-28 mx-auto max-w-[1720px] px-5 py-14 lg:px-9 lg:py-20">
          <p className="text-[11px] font-black uppercase tracking-[0.17em] text-[#1765e2]">Practical day-to-day operations</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <h2 className="max-w-2xl text-[clamp(1.75rem,2.65vw,2.8rem)] font-black leading-[1.15] tracking-[-0.045em] text-[#103257]">How the work fits together</h2>
            <p className="max-w-md text-[13px] leading-6 text-[#6d859d]">Example steps to explain the intended workflow, not customer screenshots or automated actions.</p>
          </div>
          <div className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {guide.steps.map((step,index)=><article key={step.title} className="rounded-[19px] border border-[#e0eaf8] bg-white p-6 shadow-[0_12px_35px_rgba(20,69,133,.055)]">
              <div className="flex items-center justify-between"><span className="grid size-11 place-items-center rounded-xl bg-[#e8f2ff] text-sm font-black text-[#1b65df]">{index+1}</span><span className="text-[10px] font-black tracking-widest text-[#9ab3d4]">STEP</span></div>
              <h3 className="mt-6 text-[17px] font-black text-[#163758]">{step.title}</h3>
              <p className="mt-3 text-[13px] leading-7 text-[#607b99]">{step.body}</p>
            </article>)}
          </div>
        </section>

        <section id="modules" className="scroll-mt-28 border-y border-[#e3ebf9] bg-[#f2f7ff]">
          <div className="mx-auto max-w-[1720px] px-5 py-14 lg:px-9 lg:py-20">
            <p className="text-[11px] font-black uppercase tracking-[0.17em] text-[#1765e2]">Relevant Minarva Biz modules</p>
            <h2 className="mt-3 text-[clamp(1.75rem,2.65vw,2.8rem)] font-black tracking-[-0.045em] text-[#12345a]">Tools that support the workflow</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {guide.capabilities.map((feature,index)=><article key={feature.title} className="rounded-[18px] border border-[#dce9fb] bg-white p-6">
                <span className="text-[12px] font-black tracking-widest text-[#70a0e0]">{String(index+1).padStart(2,"0")}</span>
                <h3 className="mt-4 text-[16px] font-black text-[#17395f]">{feature.title}</h3>
                <p className="mt-3 text-[13px] leading-7 text-[#617d9b]">{feature.description}</p>
              </article>)}
            </div>
            <p className="mt-5 text-xs leading-6 text-[#6881a0]">Feature availability depends on edition, enabled modules and verified deployment readiness. These examples are not a promise of customer-specific integration.</p>
          </div>
        </section>

        <section className="mx-auto max-w-[1720px] px-5 py-14 lg:px-9 lg:py-16">
          <div className="flex flex-col items-start justify-between gap-7 rounded-[24px] bg-[linear-gradient(115deg,#0d2f61,#1450a5)] px-7 py-9 text-white lg:flex-row lg:items-center lg:px-10">
            <div><p className="text-[11px] font-black uppercase tracking-[0.15em] text-[#a8d6ff]">See the full platform</p>
              <h2 className="mt-3 text-[clamp(1.55rem,2.35vw,2.5rem)] font-black tracking-[-0.04em]">Explore Minarva Biz for your business.</h2>
              <p className="mt-3 max-w-2xl text-[13px] leading-7 text-[#caddf5]">The product tour uses illustrative information. The Windows release page contains the currently published installer; self-service signup and some Online/Hybrid customer acceptance steps remain in progress.</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <a href="/#product-tour" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-5 py-3 text-[12px] font-black text-[#1555ba] hover:bg-[#eff5ff]">View product tour</a>
              <a href={releaseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/35 px-5 py-3 text-[12px] font-bold text-white hover:bg-white/10">Windows v1.0.15 release ↗</a>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-[#dce7f8] bg-[#f7fbff]">
        <div className="mx-auto flex max-w-[1720px] flex-wrap items-center justify-between gap-4 px-5 py-7 text-[12px] font-semibold text-[#5c7596] lg:px-9">
          <a href="/#industries" className="rounded-md text-[#115bdd] hover:underline">← Explore all industries</a>
          <span>Minarva Biz · Online · Windows Offline · Hybrid</span>
        </div>
      </footer>
    </div>
  );
}
