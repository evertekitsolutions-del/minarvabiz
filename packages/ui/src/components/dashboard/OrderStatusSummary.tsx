"use client";

import * as React from "react";
import { cn } from "../../lib/cn";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";

export interface OrderStatusItem {
  id: string;
  label: string;
  count: number;
  color: string; // tailwind color class e.g. bg-orange-400
}

export function OrderStatusSummary({
  title = "Order Status Summary",
  items,
  className,
}: {
  title?: string;
  items: OrderStatusItem[];
  className?: string;
}) {
  const total = items.reduce((s, i) => s + i.count, 0) || 1;
  // Conic gradient for donut

  // Map simple color names used in data to CSS colors
  const colorMap: Record<string, string> = {
    "bg-orange-400": "#fb923c",
    "bg-blue-500": "#3b82f6",
    "bg-emerald-500": "#10b981",
    "bg-violet-500": "#8b5cf6",
    "bg-slate-400": "#94a3b8",
    "bg-rose-500": "#f43f5e",
  };

  let angle = 0;
  const gradientParts = items.map((item) => {
    const pct = (item.count / total) * 360;
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
      <CardContent className="flex flex-col items-center gap-4 pt-2 sm:flex-row sm:items-center">
        <div
          className="relative h-28 w-28 shrink-0 rounded-full"
          style={{
            background: `conic-gradient(${gradientParts.join(", ")})`,
          }}
        >
          <div className="absolute inset-3 rounded-full bg-white" />
        </div>
        <ul className="w-full space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-600">
                <span className={cn("h-2.5 w-2.5 rounded-full", item.color)} />
                {item.label}
              </span>
              <span className="font-semibold text-slate-900">{item.count}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
