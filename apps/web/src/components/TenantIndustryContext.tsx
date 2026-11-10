"use client";
import * as React from "react";
import type { TenantIndustryProfile } from "@/lib/tenant-industry";

const TenantIndustryContext=React.createContext<TenantIndustryProfile|null>(null);
export const TenantIndustryProvider=TenantIndustryContext.Provider;
export function useTenantIndustry():TenantIndustryProfile|null {
 return React.useContext(TenantIndustryContext);
}
