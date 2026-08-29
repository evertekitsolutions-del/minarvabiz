"use client";

import * as React from "react";
import { cn } from "../../lib/cn";

export type StatCardTone = "blue" | "green" | "orange" | "purple" | "rose" | "slate";

export interface StatCardProps {
  title: string;
  value: string;
  changeLabel?: string;
  changePositive?: boolean;
  tone?: StatCardTone;
  icon?: React.ReactNode;
  sparkline?: number[];
  className?: string;
}

const toneStyles: Record<
  StatCardTone,
  { bg: string; iconBg: string; iconText: string; spark: string }
> = {
  blue: {
    bg: "from-blue-50 to-white",
    iconBg: "bg-blue-500",
    iconText: "text-white",
    spark: "stroke-blue-400",
  },
  green: {
    bg: "from-emerald-50 to-white",
    iconBg: "bg-emerald-500",
    iconText: "text-white",
    spark: "stroke-emerald-400",
  },
  orange: {
    bg: "from-amber-50 to-white",
    iconBg: "bg-amber-500",
    iconText: "text-white",
    spark: "stroke-amber-400",
  },
  purple: {
    bg: "from-violet-50 to-white",
    iconBg: "bg-violet-500",
    iconText: "text-white",
    spark: "stroke-violet-400",
  },
  rose: {
    bg: "from-rose-50 to-white",
    iconBg: "bg-rose-500",
    iconText: "text-white",
    spark: "stroke-rose-400",
  },
  slate: {
    bg: "from-slate-50 to-white",
    iconBg: "bg-slate-600",
    iconText: "text-white",
    spark: "stroke-slate-400",
  },
};

function MiniSpark({ data, className }: { data: number[]; className?: string }) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 64;
  const h = 24;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1 || 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className={className} viewBox={`0 0 ${w} ${h}`}>
      <polyline
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        className={className}
      />
    </svg>
  );
}

export function StatCard({
  title,
  value,
  changeLabel,
  changePositive = true,
  tone = "blue",
  icon,
  sparkline,
  className,
}: StatCardProps) {
  const t = toneStyles[tone];
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-100 bg-gradient-to-br p-4 shadow-sm",
        t.bg,
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-full", t.iconBg, t.iconText)}>
          {icon ?? (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          )}
        </div>
        {sparkline && sparkline.length > 1 && (
          <MiniSpark data={sparkline} className={t.spark} />
        )}
      </div>
      <div className="mt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
        {changeLabel && (
          <p
            className={cn(
              "mt-1 text-xs font-medium",
              changePositive ? "text-emerald-600" : "text-rose-600"
            )}
          >
            {changePositive ? "↑" : "↓"} {changeLabel}
          </p>
        )}
      </div>
    </div>
  );
}
