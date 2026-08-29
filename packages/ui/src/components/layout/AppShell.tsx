"use client";

import * as React from "react";
import { cn } from "../../lib/cn";
import { Sidebar, type SidebarProps } from "./Sidebar";
import { Header, type HeaderProps } from "./Header";
import type { NavItemId } from "../../lib/nav";

export interface AppShellProps {
  children: React.ReactNode;
  activeNav?: NavItemId;
  sidebar?: Partial<SidebarProps>;
  header?: Partial<HeaderProps>;
  onNavigate?: (href: string, id: NavItemId) => void;
  className?: string;
}

export function AppShell({
  children,
  activeNav = "dashboard",
  sidebar,
  header,
  onNavigate,
  className,
}: AppShellProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className={cn("flex h-screen w-full overflow-hidden bg-slate-50", className)}>
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar
          activeId={activeNav}
          collapsed={collapsed}
          onNavigate={onNavigate}
          {...sidebar}
        />
      </div>

      {/* Mobile overlay sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 h-full">
            <Sidebar
              activeId={activeNav}
              onNavigate={(href, id) => {
                onNavigate?.(href, id);
                setMobileOpen(false);
              }}
              {...sidebar}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          onMenuClick={() => {
            if (typeof window !== "undefined" && window.innerWidth < 768) {
              setMobileOpen((v) => !v);
            } else {
              setCollapsed((v) => !v);
            }
          }}
          {...header}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
