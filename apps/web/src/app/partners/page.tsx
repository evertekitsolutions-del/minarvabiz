import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Partner With Us | Minarva Biz",
  description: "Introduce businesses to Minarva Biz. Learn about the proposed 10% verified first-sale referral commission and submit partnership interest.",
};

const commission = [
  { heading: "Refer a business", detail: "Introduce a business that may benefit from billing, accounts, CRM, staff and future integrated online operations." },
  { heading: "Verified conversion", detail: "The business signs up through an approved sales process and completes an eligible paid first-year subscription." },
  { heading: "Earn 10%", detail: "Proposed reward: 10% of the first eligible subscription fee actually collected, excluding taxes, discounts, refunds and payment processing charges." },
] as const;
const partnerEmail = "minarvatechnologies@gmail.com";
const subject = "Minarva Biz - Referral Partner Interest";
const body = "Hello Minarva Biz team,%0A%0AI would like to enquire about becoming a referral partner.%0A%0AMy name:%0AMy business / location:%0AMy contact number:%0A%0APlease share the verified partner programme terms before any referrals.%0A";

export default function PartnersPage() {
  return <div className="min-h-screen bg-white text-[#123458]">
    <header className="border-b border-[#e3eafa] bg-white"><div className="mx-auto flex max-w-[1300px] flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-10"><a href="/" className="flex items-center gap-2 text-xl font-black text-[#13345b]"><img src="/minarva-biz-mark.svg" alt="" width={40} height={36}/>Minarva <span className="text-[#1761ee]">Biz</span></a><nav aria-label="Partner navigation" className="flex flex-wrap gap-4 text-xs font-bold text-[#466482]"><a href="/solutions" className="hover:text-[#1761ed]">Solutions</a><a href="/pricing" className="hover:text-[#1761ed]">Pricing</a><a href="/" className="hover:text-[#1761ed]">Home</a></nav></div></header>
    <main>
      <section className="bg-[linear-gradient(115deg,#0a2e6d,#135ac9_63%,#1873f2)] text-white">
        <div className="mx-auto max-w-[1300px] px-5 py-16 lg:px-10 lg:py-24">
          <p className="text-xs font-black uppercase tracking-[.18em] text-[#c6e2ff]">Minarva Biz · Partner With Us</p>
          <h1 className="mt-5 max-w-4xl text-[clamp(2.3rem,5vw,4.4rem)] font-black leading-[1.1] tracking-[-.055em]">Help businesses grow.<br/><span className="text-[#a9d5ff]">Grow with us.</span></h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-[#d3e5fa]">Share a connected business management platform with your clients and professional network. We are preparing a simple, transparent referral partner programme.</p>
          <div className="mt-8 flex flex-wrap items-center gap-4"><div className="rounded-2xl border border-white/25 bg-white/15 px-7 py-5"><strong className="text-[clamp(2.4rem,5vw,4rem)] font-black leading-none">10%</strong><p className="mt-1 text-xs font-bold text-[#e0efff]">Proposed first-sale referral reward</p></div><a href="#partner-enquiry" className="rounded-xl bg-white px-6 py-4 text-sm font-black text-[#1555b7]">Enquire about partnership →</a></div>
        </div>
      </section>
      <section className="mx-auto max-w-[1300px] px-5 py-16 lg:px-10"><h2 className="text-3xl font-black tracking-tight text-[#112e56]">How the proposed programme works</h2><div className="mt-8 grid gap-5 md:grid-cols-3">{commission.map((item,i)=><article key={item.heading} className="rounded-[22px] border border-[#dde9f8] p-7"><span className="grid size-12 place-items-center rounded-xl bg-[#eaf3ff] text-lg font-black text-[#1762e6]">{i+1}</span><h3 className="mt-6 text-xl font-black text-[#12365e]">{item.heading}</h3><p className="mt-3 text-sm leading-7 text-[#647f98]">{item.detail}</p></article>)}</div></section>
      <section id="partner-enquiry" className="border-y border-[#dce8f8] bg-[#f4f8ff]"><div className="mx-auto max-w-[1300px] px-5 py-14 lg:px-10"><h2 className="text-3xl font-black text-[#123459]">Interested in partnering?</h2><p className="mt-4 max-w-3xl text-sm leading-8 text-[#58738e]">For now, introductions are reviewed manually. There is no automatic referral tracking, partner dashboard or commission payout capability in this website yet. Approved programme terms, identity verification and a written agreement will be required before commissions are earned.</p><a className="mt-7 inline-flex min-h-12 items-center rounded-xl bg-[#1762e9] px-6 py-3 text-sm font-black text-white hover:bg-[#0e4fc5]" href={`mailto:${partnerEmail}?subject=${encodeURIComponent(subject)}&body=${body}`}>Email partnership enquiry →</a><p className="mt-3 text-xs text-[#657c96]">Opens your email application. No personal information is collected by this website.</p></div></section>
      <section className="mx-auto max-w-[1300px] px-5 py-14 lg:px-10"><h2 className="text-2xl font-black text-[#123458]">Proposed referral terms — subject to approval</h2><ul className="mt-5 list-disc space-y-3 pl-6 text-sm leading-7 text-[#5d7791]"><li>One-time commission on the first paid subscription only; renewals and additional services are excluded unless agreed separately.</li><li>Payment becomes eligible after receipt of cleared payment and a 30-day refund / verification window.</li><li>Tax, discounts, refunds, gateway charges and chargebacks are excluded from the commission base.</li><li>Duplicate leads, self-referrals, fraudulent sales and unapproved discounts are ineligible.</li><li>Partners must not promise features that are still in development, or send unsolicited messages without required consent.</li><li>Applicable taxes, invoicing, payout threshold and jurisdiction-specific conditions will be documented before launch.</li></ul><p className="mt-6 rounded-2xl border border-[#cbdcf4] bg-[#f6faff] p-5 text-xs leading-6 text-[#476786]">The 10% rate is a proposed business policy, not an active or legally binding commission offer. Referral tracking, payout workflow and agreements are pending implementation and owner approval.</p></section>
    </main>
  </div>;
}
