"use client";

import * as React from "react";
import { cn } from "../../lib/cn";
import { MAIN_NAV, NAV_SECTIONS, sidebarActiveNavId, type NavItem, type NavItemId, type NavSectionId } from "../../lib/nav";

export interface SidebarUser {
  name: string;
  role: string;
  avatarUrl?: string | null;
}

export interface SidebarProps {
  activeId?: NavItemId;
  collapsed?: boolean;
  onNavigate?: (href: string, id: NavItemId) => void;
  user?: SidebarUser;
  logoSrc?: string;
  navItems?: NavItem[];
  className?: string;
}

/** Simple SVG icons (no external icon dependency in Phase 2) */
function NavIcon({ name, className }: { name: string; className?: string }) {
  const common = cn("h-5 w-5 shrink-0", className);
  switch (name) {
    case "layout-dashboard":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      );
    case "shopping-bag":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
          <path d="M3 6h18" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      );
    case "file-text":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8" />
          <path d="M8 17h8" />
        </svg>
      );
    case "package":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
          <path d="m4 7.5 8 4.5 8-4.5" />
          <path d="M12 12v9" />
        </svg>
      );
    case "truck":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h11v10H3z" />
          <path d="M14 10h4l3 3v3h-7z" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="18" cy="18" r="2" />
          <path d="M9 18h7" />
        </svg>
      );
    case "scissors":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M20 4 8.12 15.88" />
          <path d="M14.47 14.48 20 20" />
          <path d="M8.12 8.12 12 12" />
        </svg>
      );
    case "shirt":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
        </svg>
      );
    case "wallet":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
          <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
          <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
        </svg>
      );
    case "users":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "user-cog":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="18" cy="15" r="3" />
          <circle cx="9" cy="7" r="4" />
          <path d="M10 15H6a4 4 0 0 0-4 4v2" />
          <path d="m21.7 16.4-.9-.3" />
          <path d="m15.2 13.9-.9-.3" />
          <path d="m16.6 18.7.3-.9" />
          <path d="m19.1 12.2.3-.9" />
          <path d="m19.6 18.7-.4-1" />
          <path d="m16.8 12.3-.4-1" />
          <path d="m18 12v-2" />
          <path d="m18 20v-2" />
        </svg>
      );
    case "bar-chart-3":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3v18h18" />
          <path d="M18 17V9" />
          <path d="M13 17V5" />
          <path d="M8 17v-3" />
        </svg>
      );
    case "message-circle":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        </svg>
      );
    case "bell":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case "settings":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "hard-drive":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 12H2" />
          <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          <path d="M6 16h.01" />
          <path d="M10 16h.01" />
        </svg>
      );
    case "key":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="8" cy="15" r="4" />
          <path d="m11 12 8-8" />
          <path d="m17 6 2 2" />
          <path d="m15 8 2 2" />
        </svg>
      );
    default:
      return <span className={common} />;
  }
}

export function Sidebar({
  activeId = "dashboard",
  collapsed = false,
  onNavigate,
  user = { name: "Admin", role: "Super Admin" },
  logoSrc = "/logo-mark.png",
  navItems = MAIN_NAV,
  className,
}: SidebarProps) {
  const brandLogo = logoSrc || "/logo-mark.png";
  const resolvedActiveId = sidebarActiveNavId(activeId);
  const activeItem = navItems.find((item) => item.id === resolvedActiveId);
  const activeSection = activeItem?.section ?? null;
  const [openSection, setOpenSection] = React.useState<NavSectionId | null>(
    () => activeSection || "sales-operations"
  );

  React.useEffect(() => {
    if (activeSection) setOpenSection(activeSection);
  }, [activeSection]);

  const standaloneItems = navItems.filter((item) => !item.section);
  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: navItems.filter((item) => item.section === section.id),
  })).filter((section) => section.items.length > 0);

  const renderNavItem = (item: NavItem) => {
    const active = item.id === resolvedActiveId;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onNavigate?.(item.href, item.id)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150",
          active
            ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-950/30"
            : "text-slate-400 hover:bg-white/5 hover:text-white",
          collapsed && "justify-center px-2"
        )}
        title={collapsed ? item.label : undefined}
      >
        <NavIcon name={item.icon} className={active ? "text-white" : undefined} />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </button>
    );
  };

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-gradient-to-b from-[#071633] via-[#0A1733] to-[#06132C] text-slate-300 transition-all duration-200",
        collapsed ? "w-[72px]" : "w-[264px]",
        className
      )}
    >
      <div className={cn("border-b border-white/5 px-4 py-4", collapsed && "px-2 py-3")}>
        {!collapsed ? (
          <div className="flex flex-col items-center text-center">
            <img
              src={brandLogo}
              alt="Minarva Biz"
              className="h-16 w-16 object-contain drop-shadow-[0_8px_18px_rgba(37,99,235,0.25)]"
            />
            <div className="mt-1.5 text-[20px] font-bold tracking-tight text-white">
              Minarva<span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-fuchsia-400 bg-clip-text text-transparent"> Biz</span>
            </div>
            <div className="mt-0.5 text-[10px] font-medium tracking-wide text-slate-400">Boutique Billing & Management</div>
          </div>
        ) : (
          <div className="flex justify-center">
            <img src={brandLogo} alt="Minarva Biz" className="h-10 w-10 object-contain" />
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {collapsed ? (
          <div className="space-y-1">
            {navItems.map((item) => renderNavItem(item))}
          </div>
        ) : (
          <>
            <div className="space-y-1">
              {standaloneItems.map((item) => renderNavItem(item))}
            </div>

            <div className="mt-2 space-y-1.5">
              {visibleSections.map((section) => {
                const expanded = openSection === section.id;
                const groupHasActive = section.items.some((item) => item.id === resolvedActiveId);
                return (
                  <div key={section.id}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setOpenSection((current) => current === section.id ? null : section.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors",
                        groupHasActive ? "text-indigo-300" : "text-slate-500 hover:bg-white/[0.03] hover:text-slate-300"
                      )}
                    >
                      <span>{section.label}</span>
                      <svg
                        className={cn("h-3.5 w-3.5 transition-transform duration-150", expanded && "rotate-90")}
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="m7 5 5 5-5 5" />
                      </svg>
                    </button>
                    {expanded && (
                      <div className="mt-1 space-y-1 border-l border-white/5 pl-1">
                        {section.items.map((item) => renderNavItem(item))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </nav>

      <div className={cn("border-t border-white/5 p-3.5", collapsed && "flex justify-center p-3")}>
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-semibold text-white">
            {user.name.charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-white">{user.name}</div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {user.role}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
