import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { featureGuides, findFeatureGuide } from "../feature-guides";

const releaseUrl = "https://github.com/evertekitsolutions-del/minarvabiz/releases/tag/v1.0.15";
type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return featureGuides.map(guide => ({slug:guide.slug}));
}
export async function generateMetadata({params}:Props):Promise<Metadata> {
  const {slug} = await params;
  const guide = findFeatureGuide(slug);
  if(!guide) return {title:"Feature not found | Minarva Biz",robots:{index:false,follow:false}};
  return {
    title:guide.title+" | Minarva Biz business management",
    description:guide.summary,
    robots:{index:true,follow:true},
  };
}

export default async function PublicFeaturePage({params}:Props) {
  const {slug} = await params;
  const guide = findFeatureGuide(slug);
  if(!guide) notFound();
  return <div className="min-h-screen bg-white text-[#183654]">
    <a href="#main-feature" className="sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:not-sr-only focus:rounded-lg focus:bg-white focus:p-3">Skip to content</a>
    <header className="sticky top-0 z-40 border-b border-[#dfeafb] bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1720px] flex-wrap items-center justify-between gap-3 px-5 py-3 lg:px-9">
        <a href="/" aria-label="Minarva Biz home" className="flex items-center gap-2.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1462e8]">
          <img src="/minarva-biz-mark.svg" alt="" width={46} height={40} className="h-10 w-[46px] object-contain" decoding="async" />
          <span className="text-[21px] font-black tracking-[-0.05em] text-[#123052]">Minarva <span className="text-[#1267f0]">Biz</span></span>
        </a>
        <nav aria-label="Feature navigation" className="flex flex-wrap items-center gap-2">
          <a href="/#features" className="inline-flex min-h-10 items-center rounded-xl border border-[#cbdcf4] px-4 text-xs font-bold text-[#1c5fae] hover:bg-[#f1f6ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1765f0]">← All features</a>
          <a href="/login" className="inline-flex min-h-10 items-center rounded-xl bg-[#1462ee] px-4 text-xs font-bold text-white hover:bg-[#074cca] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1765f0]">Customer login</a>
        </nav>
      </div>
    </header>
    <main id="main-feature">
      <section className="relative isolate overflow-hidden bg-[linear-gradient(110deg,#eaf3ff_0%,#f7fbff_55%,#ffffff_100%)]">
        <div className="pointer-events-none absolute -right-20 -top-36 size-[630px] rounded-full bg-[#d6e8ff]/55 blur-[90px]" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-[1720px] items-center gap-9 px-5 py-12 lg:grid-cols-[1.12fr_.88fr] lg:gap-12 lg:px-9 lg:py-16">
          <div>
            <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-[11px] font-semibold text-[#6481a0]">
              <a href="/">Home</a><span aria-hidden="true">/</span><a href="/#features">Features</a><span aria-hidden="true">/</span><span aria-current="page" className="text-[#1260df]">{guide.title}</span>
            </nav>
            <p className="mt-8 inline-flex rounded-full border border-[#d0e3ff] bg-[#e5f0ff] px-4 py-2 text-[10px] font-black uppercase tracking-[.14em] text-[#1462df]">{guide.eyebrow}</p>
            <h1 className="mt-5 max-w-[760px] text-[clamp(2.15rem,3.4vw,3.65rem)] font-black leading-[1.12] tracking-[-.05em] text-[#102c53]">{guide.headline}</h1>
            <p className="mt-5 max-w-[700px] text-[14px] leading-7 text-[#597594] sm:text-[15px]">{guide.summary}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#feature-workflow" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#1465ed] px-6 py-3 text-[13px] font-extrabold text-white shadow-[0_9px_23px_rgba(25,94,219,.15)] hover:bg-[#0753cc]">Explore the workflow ↓</a>
              <a href="/#product-tour" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#bcd5fb] bg-white px-6 py-3 text-[13px] font-bold text-[#1a5bd0] hover:bg-[#edf5ff]">Interactive product tour</a>
            </div>
          </div>
          <aside aria-label="Illustrative workflow example" className="rounded-[22px] border border-[#d1e1f9] bg-white p-5 shadow-[0_22px_55px_rgba(21,80,151,.09)] sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e7eef9] pb-5">
              <div><span className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#2369cf]">Illustrative workflow</span><h2 className="mt-2 text-lg font-black text-[#183d63]">A typical working day</h2></div>
              <span className="rounded-full bg-[#e8f6ee] px-3 py-1.5 text-[10px] font-bold text-[#188450]">Sample</span>
            </div>
            <ol className="mt-5 space-y-3">
              {guide.steps.map((item,index)=><li key={item.title} className="flex items-center gap-3 rounded-xl border border-[#e3ecfa] bg-[#f8fbff] px-3 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#e3efff] text-[12px] font-black text-[#2169d7]">{String(index+1).padStart(2,"0")}</span>
                <span className="text-[12px] font-extrabold text-[#2a4a71]">{item.title}</span>
                <span className="ml-auto shrink-0 text-[#4089e8]" aria-hidden="true">→</span>
              </li>)}
            </ol>
            <div className="mt-5 rounded-xl border border-[#dfebfa] bg-[linear-gradient(125deg,#f1f7ff,#fbfdff)] p-4">
              <p className="text-[10px] font-black uppercase tracking-[.12em] text-[#2068d0]">Example scenario</p>
              <p className="mt-2 text-[12px] leading-6 text-[#597694]">{guide.example}</p>
            </div>
            <p className="mt-4 text-[11px] leading-5 text-[#6a86a5]">Sample descriptions, not a verified customer account or live application screenshot.</p>
          </aside>
        </div>
      </section>
      <section id="feature-workflow" className="scroll-mt-28 mx-auto max-w-[1720px] px-5 py-14 lg:px-9 lg:py-20">
        <p className="text-[11px] font-black uppercase tracking-[.16em] text-[#1b67e6]">From input to completion</p>
        <h2 className="mt-3 text-[clamp(1.8rem,2.75vw,2.85rem)] font-black tracking-[-.04em] text-[#0e2e54]">How the workflow fits together</h2>
        <p className="mt-4 max-w-2xl text-[13px] leading-7 text-[#68819c]">Follow an illustrative, four-stage sequence designed to explain the role of this feature in everyday business operations.</p>
        <div className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {guide.steps.map((item,index)=><article key={item.title} className="rounded-[19px] border border-[#dae8f8] bg-white p-6 shadow-[0_10px_28px_rgba(16,61,120,.055)]">
            <div className="flex justify-between"><span className="grid size-11 place-items-center rounded-xl bg-[#e7f2ff] text-[14px] font-black text-[#1764d7]">{index+1}</span><span className="text-[10px] font-black text-[#a9bfd7]">WORKFLOW</span></div>
            <h3 className="mt-6 text-[16px] font-black text-[#1c4268]">{item.title}</h3>
            <p className="mt-3 text-[13px] leading-7 text-[#607c9a]">{item.detail}</p>
          </article>)}
        </div>
      </section>
      <section id="feature-benefits" className="scroll-mt-28 border-y border-[#e4edfa] bg-[#f3f8ff]">
        <div className="mx-auto max-w-[1720px] px-5 py-14 lg:px-9 lg:py-20">
          <p className="text-[11px] font-black uppercase tracking-[.16em] text-[#1b67e6]">Connected tools</p>
          <h2 className="mt-3 text-[clamp(1.8rem,2.75vw,2.85rem)] font-black tracking-[-.04em] text-[#0e2e54]">What it brings together</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {guide.benefits.map((item,index)=><article key={item.title} className="rounded-[18px] border border-[#d9e6f8] bg-white p-6">
              <span className="text-[11px] font-black tracking-widest text-[#82a9e8]">{String(index+1).padStart(2,"0")}</span>
              <h3 className="mt-4 text-[16px] font-black text-[#193a63]">{item.title}</h3>
              <p className="mt-3 text-[13px] leading-7 text-[#637f9e]">{item.detail}</p>
            </article>)}
          </div>
          <p className="mt-6 max-w-3xl text-xs leading-6 text-[#627d9b]">Feature availability depends on edition, enabled modules, hardware, country rules and completed acceptance testing. This marketing page does not certify statutory compliance or online/offline synchronization for a particular customer.</p>
        </div>
      </section>
      <section aria-label="Explore other modules" className="mx-auto max-w-[1720px] px-5 py-14 lg:px-9">
        <h2 className="text-[20px] font-black text-[#12355a]">Explore other Minarva Biz features</h2>
        <nav aria-label="More feature guides" className="mt-5 flex flex-wrap gap-2.5">
          {featureGuides.filter(item=>item.slug!==guide.slug).map(item=><a key={item.slug} href={"/features/"+item.slug} className="rounded-xl border border-[#dae7fb] bg-[#f6faff] px-4 py-3 text-[12px] font-bold text-[#2a599c] hover:border-[#accaf7] hover:bg-[#e9f3ff]">{item.title} →</a>)}
        </nav>
      </section>
      <section className="mx-auto max-w-[1720px] px-5 pb-16 lg:px-9">
        <div className="flex flex-wrap items-center justify-between gap-6 rounded-[24px] bg-[linear-gradient(115deg,#103769,#1859b5)] px-7 py-9 text-white lg:px-10">
          <div><p className="text-[10px] font-black uppercase tracking-[.15em] text-[#add8ff]">Minarva Biz platform</p><h2 className="mt-3 text-[clamp(1.55rem,2.4vw,2.5rem)] font-black tracking-[-.04em]">See how the modules work together.</h2><p className="mt-3 max-w-xl text-[13px] leading-7 text-[#d0e2f8]">Explore the sample product tour or review the currently published Windows release. Trial signup and some commercial acceptance steps remain in progress.</p></div>
          <div className="flex flex-wrap gap-3"><a href="/#product-tour" className="rounded-xl bg-white px-5 py-3 text-[12px] font-extrabold text-[#1559c3]">View product tour</a><a href={releaseUrl} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-white/35 px-5 py-3 text-[12px] font-bold text-white">Windows v1.0.15 release ↗</a></div>
        </div>
      </section>
    </main>
    <footer className="border-t border-[#dfe8f6] bg-[#f7faff]"><div className="mx-auto flex max-w-[1720px] flex-wrap items-center justify-between gap-4 px-5 py-7 text-[12px] font-semibold text-[#5c7596] lg:px-9"><a href="/#features" className="text-[#175cdb] hover:underline">← All features</a><span>Minarva Biz · Online · Windows Offline · Hybrid</span></div></footer>
  </div>;
}
