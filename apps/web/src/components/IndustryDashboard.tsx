"use client";
import * as React from "react";
import {Dashboard,type QuickAction} from "@minarvabiz/ui";
import {useTenantIndustry} from "@/components/TenantIndustryContext";
import {visibleIndustryActions} from "@/lib/tenant-industry";
import {getRuntimeMode} from "@minarvabiz/business-logic";

export function IndustryDashboard({
 data,quickActions,
}:{
 data:React.ComponentProps<typeof Dashboard>["data"];
 quickActions:QuickAction[];
}){
 const profile=useTenantIndustry();
 const allowed=visibleIndustryActions(profile);
 return <Dashboard data={data} quickActions={getRuntimeMode()==="demo"?quickActions:quickActions.filter(a=>allowed.has(a.id))}/>;
}
