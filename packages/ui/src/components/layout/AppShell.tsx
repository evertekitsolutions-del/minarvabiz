"use client";

import * as React from "react";
import { cn } from "../../lib/cn";
import { Sidebar, type SidebarProps } from "./Sidebar";
import { Header, type HeaderProps } from "./Header";
import { CommandPalette } from "../command/CommandPalette";
import { GlobalSearchPalette } from "../search/GlobalSearchPalette";
import { OfflineModulesPanel } from "../desktop/OfflineModulesPanel";
import type { NavItemId } from "../../lib/nav";

export interface AppShellProps {
  children: React.ReactNode;
  activeNav?: NavItemId;
  sidebar?: Partial<SidebarProps>;
  header?: Partial<HeaderProps>;
  onNavigate?: (href: string, id: NavItemId) => void;
  desktopModuleContext?: { customerId?: string; staffId?: string; returnSaleId?: string; onReturnSaleHandled?: () => void };
  className?: string;
}

export function AppShell({ children, activeNav = "dashboard", sidebar, header, onNavigate, desktopModuleContext, className }: AppShellProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const hasExternalSearch = typeof header?.onSearch === "function";
  const showLocalSearch = !hasExternalSearch;

  React.useEffect(() => {
    if ((!showLocalSearch || !searchQuery) && !mobileOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (showLocalSearch && searchQuery) setSearchQuery("");
      if (mobileOpen) setMobileOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mobileOpen, searchQuery, showLocalSearch]);

  const handleNavigate = React.useCallback((href: string, id: NavItemId) => { setSearchQuery(""); onNavigate?.(href, id); }, [onNavigate]);
  const isDesktopShell = typeof window !== "undefined" && "minarvaDesktop" in window;

  return (
    <div className={cn("flex h-[100dvh] w-full overflow-hidden bg-slate-50", className)}>
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[200] -translate-y-24 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-lg transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-indigo-400"
      >
        Skip to main content
      </a>
      <div className="hidden md:flex"><Sidebar activeId={activeNav} collapsed={collapsed} onNavigate={handleNavigate} {...sidebar} /></div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} aria-label="Close navigation menu" />
          <div className="relative z-10 h-full"><Sidebar activeId={activeNav} onNavigate={(href, id) => { handleNavigate(href, id); setMobileOpen(false); }} {...sidebar} /></div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => { if (typeof window !== "undefined" && window.innerWidth < 768) setMobileOpen((v) => !v); else setCollapsed((v) => !v); }} {...header} onSearch={(query) => { header?.onSearch?.(query); if (showLocalSearch) setSearchQuery(query); }} />
        {showLocalSearch && searchQuery && <GlobalSearchPalette query={searchQuery} onClose={() => setSearchQuery("")} onNavigate={handleNavigate} />}
        <main id="main-content" tabIndex={-1} data-testid="app-content" className="flex-1 overflow-y-auto p-4 outline-none md:p-6">{children}{isDesktopShell && <OfflineModulesPanel activeNav={activeNav} preferredCustomerId={desktopModuleContext?.customerId} preferredStaffId={desktopModuleContext?.staffId} preferredReturnSaleId={desktopModuleContext?.returnSaleId} onReturnSaleHandled={desktopModuleContext?.onReturnSaleHandled} onNavigate={handleNavigate} />}</main>
      </div>
      <CommandPalette activeNav={activeNav} onNavigate={handleNavigate} />
    </div>
  );
}
