"use client";

import * as React from "react";
import { cn } from "../../lib/cn";
import { Sidebar, type SidebarProps } from "./Sidebar";
import { Header, type HeaderProps } from "./Header";
import { CommandPalette } from "../command/CommandPalette";
import { GlobalSearchPalette } from "../search/GlobalSearchPalette";
import { OfflineModulesPanel } from "../desktop/OfflineModulesPanel";
import { sidebarActiveNavId, type NavItemId } from "../../lib/nav";

/** Tasks kept in the thumb zone on narrow screens; the full sidebar is still available. */
const MOBILE_QUICK_LINKS: { id: NavItemId; href: string; label: string }[] = [
  { id: "dashboard", href: "/dashboard", label: "Home" },
  { id: "sales", href: "/sales", label: "Sales" },
  { id: "products", href: "/products", label: "Products" },
  { id: "customers", href: "/customers", label: "Customers" },
];

function MobileQuickIcon({ id }: { id: NavItemId | "more" }) {
  const iconPaths: Record<string, React.ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="8" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="15" width="7" height="6" rx="1.5" /></>,
    sales: <><path d="M3 7h18l-2 13H5L3 7Z" /><path d="M8 9V6a4 4 0 0 1 8 0v3" /></>,
    products: <><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z" /><path d="m3 7 9 5 9-5M12 12v10" /></>,
    customers: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2H3ZM17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5v1" /></>,
    more: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  };
  return <svg aria-hidden="true" focusable="false" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{iconPaths[id]}</svg>;
}

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
  const mobileActive = sidebarActiveNavId(activeNav);

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
        <div id="mobile-primary-navigation" className="fixed inset-0 z-40 flex md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} aria-label="Close navigation menu" />
          <div className="relative z-10 h-full"><Sidebar activeId={activeNav} onNavigate={(href, id) => { handleNavigate(href, id); setMobileOpen(false); }} {...sidebar} /></div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => { if (typeof window !== "undefined" && window.innerWidth < 768) setMobileOpen((v) => !v); else setCollapsed((v) => !v); }} {...header} onSearch={(query) => { header?.onSearch?.(query); if (showLocalSearch) setSearchQuery(query); }} />
        {showLocalSearch && searchQuery && <GlobalSearchPalette query={searchQuery} onClose={() => setSearchQuery("")} onNavigate={handleNavigate} />}
        <main id="main-content" tabIndex={-1} data-testid="app-content" className="flex-1 overflow-y-auto p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] outline-none md:p-6">{children}{isDesktopShell && <OfflineModulesPanel activeNav={activeNav} preferredCustomerId={desktopModuleContext?.customerId} preferredStaffId={desktopModuleContext?.staffId} preferredReturnSaleId={desktopModuleContext?.returnSaleId} onReturnSaleHandled={desktopModuleContext?.onReturnSaleHandled} onNavigate={handleNavigate} />}</main>
      </div>
      <nav
        aria-label="Mobile quick navigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(15,23,42,0.08)] backdrop-blur md:hidden"
      >
        <div className="grid h-16 grid-cols-5">
          {MOBILE_QUICK_LINKS.map((item) => {
            const active = mobileActive === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => { handleNavigate(item.href, item.id); setMobileOpen(false); }}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500",
                  active ? "text-indigo-700" : "text-slate-500 hover:text-slate-900"
                )}
              >
                <MobileQuickIcon id={item.id} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            aria-label="More modules"
            aria-controls="mobile-primary-navigation"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
            className="flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
          >
            <MobileQuickIcon id="more" />
            <span>More</span>
          </button>
        </div>
      </nav>
      <CommandPalette activeNav={activeNav} onNavigate={handleNavigate} />
    </div>
  );
}
