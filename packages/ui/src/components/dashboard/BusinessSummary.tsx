"use client";

import * as React from "react";
import { cn } from "../../lib/cn";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";

export interface BusinessSummaryItem {
  id: string;
  label: string;
  value: string;
  icon?: React.ReactNode;
  highlight?: boolean;
}

export function BusinessSummary({
  title = "Business Summary (Today)",
  items,
  netProfit,
  className,
}: {
  title?: string;
  items: BusinessSummaryItem[];
  netProfit?: { label: string; value: string };
  className?: string;
}) {
  return (
    <Card className={cn("h-full", className)}>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-800">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-3">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
                {item.icon}
              </span>
              {item.label}
            </div>
            <span className="text-sm font-semibold text-slate-900">{item.value}</span>
          </div>
        ))}
        {netProfit && (
          <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3v18h18" />
                <path d="m19 9-5 5-4-4-3 3" />
              </svg>
              {netProfit.label}
            </div>
            <span className="text-base font-bold text-emerald-700">{netProfit.value}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
