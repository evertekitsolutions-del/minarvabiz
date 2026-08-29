"use client";

import * as React from "react";
import { cn } from "../../lib/cn";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";

export interface SalesPoint {
  label: string;
  value: number;
}

/**
 * Lightweight SVG line chart — no external chart library required.
 * Ready to receive live data from Supabase / SQLite.
 */
export function SalesOverviewChart({
  title = "Sales Overview",
  periodLabel = "Last 7 Days",
  data,
  className,
  onPeriodChange,
}: {
  title?: string;
  periodLabel?: string;
  data: SalesPoint[];
  className?: string;
  onPeriodChange?: () => void;
}) {
  const width = 560;
  const height = 220;
  const pad = { top: 16, right: 16, bottom: 32, left: 44 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const max = Math.max(...data.map((d) => d.value), 1);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));

  const points = data.map((d, i) => {
    const x = pad.left + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
    const y = pad.top + innerH - (d.value / max) * innerH;
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${pad.top + innerH} L ${points[0].x} ${pad.top + innerH} Z`
      : "";

  function formatAxis(v: number): string {
    if (v >= 100000) return `${(v / 1000).toFixed(0)}K`;
    if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
    return String(v);
  }

  return (
    <Card className={cn("h-full", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0">
        <CardTitle className="text-base font-semibold text-slate-800">{title}</CardTitle>
        <button
          type="button"
          onClick={onPeriodChange}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {periodLabel} ▾
        </button>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-auto w-full min-w-[320px]"
            role="img"
            aria-label={title}
          >
            {/* Grid */}
            {yTicks.map((tick) => {
              const y = pad.top + innerH - (tick / max) * innerH;
              return (
                <g key={tick}>
                  <line
                    x1={pad.left}
                    x2={width - pad.right}
                    y1={y}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={pad.left - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-400"
                    fontSize="11"
                  >
                    {formatAxis(tick)}
                  </text>
                </g>
              );
            })}

            {/* Area fill */}
            {areaPath && (
              <path d={areaPath} fill="url(#salesGradient)" opacity="0.35" />
            )}

            {/* Line */}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke="#6366f1"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Dots */}
            {points.map((p) => (
              <circle
                key={p.label}
                cx={p.x}
                cy={p.y}
                r="4"
                fill="#fff"
                stroke="#6366f1"
                strokeWidth="2"
              />
            ))}

            {/* X labels */}
            {points.map((p) => (
              <text
                key={`lbl-${p.label}`}
                x={p.x}
                y={height - 8}
                textAnchor="middle"
                className="fill-slate-400"
                fontSize="11"
              >
                {p.label}
              </text>
            ))}

            <defs>
              <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#818cf8" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}
