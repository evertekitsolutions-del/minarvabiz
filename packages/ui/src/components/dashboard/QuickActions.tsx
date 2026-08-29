"use client";

import * as React from "react";
import { cn } from "../../lib/cn";

export interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  onClick?: () => void;
  tone?: "blue" | "pink" | "cyan" | "green" | "violet" | "indigo" | "emerald" | "teal";
}

const toneMap = {
  blue: "bg-blue-50 text-blue-600 hover:bg-blue-100",
  pink: "bg-pink-50 text-pink-600 hover:bg-pink-100",
  cyan: "bg-cyan-50 text-cyan-600 hover:bg-cyan-100",
  green: "bg-emerald-50 text-emerald-600 hover:bg-emerald-100",
  violet: "bg-violet-50 text-violet-600 hover:bg-violet-100",
  indigo: "bg-indigo-50 text-indigo-600 hover:bg-indigo-100",
  emerald: "bg-emerald-50 text-emerald-600 hover:bg-emerald-100",
  teal: "bg-teal-50 text-teal-600 hover:bg-teal-100",
};

export function QuickActions({
  actions,
  className,
}: {
  actions: QuickAction[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8",
        className
      )}
    >
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={a.onClick}
          className={cn(
            "flex flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white p-4 text-center shadow-sm transition hover:shadow-md",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          )}
        >
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-xl transition",
              toneMap[a.tone ?? "blue"]
            )}
          >
            {a.icon}
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-800">{a.label}</div>
            <div className="text-[11px] text-slate-500">{a.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
