import type { ReactNode } from "react";
export function LegalPageShell({title,description,children}:{title:string;description:string;children:ReactNode}){
 return <div className="min-h-screen bg-[#f7faff] text-[#173657]">
  <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-5">
   <a href="/" className="text-xl font-black text-[#135be8]">Minarva Biz</a>
   <nav aria-label="Information pages" className="flex flex-wrap gap-4 text-sm"><a href="/pricing">Pricing</a><a href="/contact">Support</a><a href="/">Home</a></nav>
  </div></header>
  <main className="mx-auto max-w-4xl px-5 py-14"><h1 className="text-4xl font-extrabold tracking-tight">{title}</h1>
   <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">{description}</p>
   <p className="mt-3 text-xs text-slate-500">Effective 10 November 2026</p>
   <article className="mt-9 space-y-7 rounded-2xl border border-slate-200 bg-white p-6 leading-7 shadow-sm sm:p-10 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-bold [&_p]:text-slate-700 [&_a]:text-blue-700">{children}</article>
  </main>
  <footer className="border-t border-slate-200 bg-white"><nav aria-label="Legal links" className="mx-auto flex max-w-4xl flex-wrap gap-5 px-5 py-6 text-sm">
   <a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/refund-policy">Refunds</a><a href="/contact">Support</a>
  </nav></footer>
 </div>;
}
