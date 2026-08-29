"use client";

import * as React from "react";
import { cn } from "../../lib/cn";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";

export interface LowStockItem {
  id: string;
  name: string;
  stock: number;
  unit?: string;
  imageUrl?: string | null;
}

export function LowStockAlert({
  title = "Low Stock Alert",
  items,
  onViewAll,
  className,
}: {
  title?: string;
  items: LowStockItem[];
  onViewAll?: () => void;
  className?: string;
}) {
  return (
    <Card className={cn("h-full", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0">
        <CardTitle className="text-base font-semibold text-slate-800">{title}</CardTitle>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            View All
          </button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m7.5 4.27 9 5.15" />
                  <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                  <path d="m3.3 7 8.7 5 8.7-5" />
                  <path d="M12 22V12" />
                </svg>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-800">{item.name}</div>
              <div className="text-xs font-medium text-rose-600">
                Stock: {item.stock}
                {item.unit ? ` ${item.unit}` : ""}
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-400">All stock levels healthy</p>
        )}
      </CardContent>
    </Card>
  );
}
