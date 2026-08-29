"use client";

import * as React from "react";
import { cn } from "../../lib/cn";

export interface HeaderProps {
  title?: string;
  subtitle?: string;
  dateLabel?: string;
  notificationCount?: number;
  messageCount?: number;
  onMenuClick?: () => void;
  onSearch?: (query: string) => void;
  onNotificationsClick?: () => void;
  onMessagesClick?: () => void;
  className?: string;
}

export function Header({
  title = "Dashboard",
  subtitle = "Welcome back, Admin!",
  dateLabel,
  notificationCount = 0,
  messageCount = 0,
  onMenuClick,
  onSearch,
  onNotificationsClick,
  onMessagesClick,
  className,
}: HeaderProps) {
  const [query, setQuery] = React.useState("");
  const today =
    dateLabel ??
    new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  return (
    <header
      className={cn(
        "flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 md:px-6",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          aria-label="Toggle menu"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-slate-900">{title}</h1>
          <p className="hidden truncate text-xs text-slate-500 sm:block">{subtitle}</p>
        </div>
      </div>

      {/* Global search */}
      <div className="hidden max-w-md flex-1 md:block">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            placeholder="Search customers, orders, products, invoices…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              onSearch?.(e.target.value);
            }}
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <button
          type="button"
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Calendar"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </button>

        <button
          type="button"
          onClick={onMessagesClick}
          className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Messages"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
          </svg>
          {messageCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
              {messageCount > 9 ? "9+" : messageCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onNotificationsClick}
          className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Notifications"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          {notificationCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
              {notificationCount > 9 ? "9+" : notificationCount}
            </span>
          )}
        </button>

        <div className="ml-1 hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 sm:flex">
          <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          <span className="whitespace-nowrap">{today}</span>
        </div>
      </div>
    </header>
  );
}
