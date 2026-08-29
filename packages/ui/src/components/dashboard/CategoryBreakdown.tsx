"use client";

import * as React from "react";
import { cn } from "../../lib/cn";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";

export interface CategoryItem {
  id: string;
  label: string;
  value: string;
  percent: number;
  color: string;
}

export function CategoryBreakdown({
  title = "Top Selling Categories (This Month)",
  items,
  className,
}: {
  title?: string;
  items: CategoryItem[];
  className?: string;
}) {
  const colorMap: Record<string, string> = {
    "bg-violet-500": "#8b5cf6",
    "bg-blue-500": "#3b82f6",
    "bg-emerald-500": "#10b981",
    "bg-orange-400": "#fb923c",
    "bg-slate-400": "#94a3b8",
    "bg-rose-500": "#f43f5e",
    "bg-cyan-500": "#06b6d4",
  };

  let angle = 0;
  const totalPct = items.reduce((s, i) => s + i.percent, 0) || 100;
  const gradientParts = items.map((item) => {
    const pct = (item.percent / totalPct) * 360;
    const start = angle;
    angle += pct;
    const hex = colorMap[item.color] ?? "#94a3b8";
    return `${hex} ${start}deg ${angle}deg`;
  });

  return (
    <Card className={cn("h-full", className)}>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-800">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4 pt-2 sm:flex-row">
        <div
          className="relative h-32 w-32 shrink-0 rounded-full"
          style={{ background: `conic-gradient(${gradientParts.join(", ")})` }}
        >
          <div className="absolute inset-4 rounded-full bg-white" />
        </div>
        <ul className="w-full space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-slate-600">
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", item.color)} />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="shrink-0 font-medium text-slate-800">
                {item.value}{" "}
                <span className="text-slate-400">({item.percent}%)</span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
