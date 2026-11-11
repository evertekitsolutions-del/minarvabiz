"use client";
import * as React from "react";
import Link from "next/link";
import {Dashboard,type QuickAction} from "@minarvabiz/ui";
import {useTenantIndustry} from "@/components/TenantIndustryContext";
import {OPTIONAL_MODULES,VERTICALS,visibleIndustryActions} from "@/lib/tenant-industry";
import {getRuntimeMode} from "@minarvabiz/business-logic";

// These routes have dedicated tenant-aware screens. Staged capabilities (loyalty)
// and generic notifications (not a marketing workspace) are deliberately excluded.
const DASHBOARD_APP_IDS=new Set(["crm","online_store","field_service"]);
export function IndustryDashboard({
 data,quickActions,
}:{
 data:React.ComponentProps<typeof Dashboard>["data"];
 quickActions:QuickAction[];
}){
 const profile=useTenantIndustry();
 const allowed=visibleIndustryActions(profile);
 const apps=profile?OPTIONAL_MODULES.filter(a=>
  DASHBOARD_APP_IDS.has(a.id)&&profile.enabled_modules.includes(a.id)
 ): [];
 const industries=profile?VERTICALS.filter(v=>profile.enabled_verticals.includes(v.id)):[];
 return <div className="space-y-4">
  {profile&&<section aria-label="Your business workspace" className="rounded-xl border border-slate-200 bg-white p-4">
   <h2 className="text-base font-semibold text-slate-900">Your business workspace</h2>
   <p className="mt-1 text-sm text-slate-600">{industries.length?
    industries.map(v=>v.label).join(" · "):
    "Select your business type in Settings → Business Industry & Apps."}</p>
   {apps.length>0&&<div className="mt-3 flex flex-wrap gap-2" aria-label="Enabled optional apps">
    {apps.map(a=><Link key={a.id} href={a.href}
      className="inline-flex min-h-11 items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800 hover:bg-blue-100">
      {a.label}
    </Link>)}
   </div>}
   <p className="mt-2 text-xs text-slate-500">App preferences control navigation only; permissions, subscription entitlement and feature availability are verified separately.</p>
  </section>}
  <Dashboard data={data} quickActions={getRuntimeMode()==="demo"?quickActions:quickActions.filter(a=>allowed.has(a.id))}/>
 </div>;
}
