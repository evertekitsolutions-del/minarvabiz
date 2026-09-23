"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { AppShell, AuthGate, ToastProvider, ErrorBoundary, type NavItemId } from "@minarvabiz/ui";
import {
  bootstrapFromLocalStorage, globalSearch,
  setCurrentRole,
  clearSession,
  getSessionUser,
  getSessionToken,
  phase6Store,
  phase9Store,
  getRuntimeMode,
} from "@minarvabiz/business-logic";
import { hydrateStoresFromSupabase } from "@/lib/data-source";
import { SetupBanner } from "@/components/SetupBanner";

const requireAuthByDefault =
  process.env.NODE_ENV === "production"
    ? process.env.NEXT_PUBLIC_REQUIRE_AUTH !== "false"
    : process.env.NEXT_PUBLIC_REQUIRE_AUTH === "true";

const pathToNav: Record<string, NavItemId> = {
  "/dashboard": "dashboard",
  "/sales": "sales",
  "/warehouse": "warehouse",
  "/quotations": "sales",
  "/cash-register": "reports",
  "/payments": "payments",
  "/accounting": "accounting",
  "/services": "services",
  "/services/production": "services",
  "/laundry": "laundry",
  "/expenses": "expenses",
  "/purchases": "purchases",
  "/customers": "customers",
  "/customer-crm": "customer-crm",
  "/staff": "staff",
  "/staff-detail": "staff-detail",
  "/suppliers": "suppliers",
  "/returns": "returns",
  "/reports": "reports",
  "/day-end": "day-end",
  "/audit": "audit",
  "/notifications": "notifications",
  "/settings": "settings",
  "/users": "settings",
  "/onboarding": "dashboard",
  "/help": "settings",
  "/system": "settings",
  "/delivery": "services",
  "/stock-take": "sales",
  "/tools": "settings",
  "/license": "settings",
  "/backup": "backup",
};

export function AppLayoutClient({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [searchResults, setSearchResults] = React.useState<Array<{kind:string;id:string;title:string;subtitle:string;href:string}>>([]);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [userName, setUserName] = React.useState<string | undefined>();
  const [unreadNotifications, setUnreadNotifications] = React.useState(0);

  const refreshNotificationCount = React.useCallback(() => {
    setUnreadNotifications(phase6Store.unreadNotificationCount());
  }, []);

  React.useEffect(() => {
    bootstrapFromLocalStorage();
    const u = getSessionUser();
    const token = getSessionToken();
    const runtimeMode = getRuntimeMode();
    if (u) {
      setUserName(u.fullName || u.email);
      setCurrentRole(u.role as Parameters<typeof setCurrentRole>[0]);
    } else if (runtimeMode === "demo") {
      // Explicit demo mode is a non-production QA/demo environment. Give it an
      // admin role so the visible demo controls can execute real domain mutations.
      setUserName("Demo Admin");
      setCurrentRole("admin");
    }
    if (runtimeMode !== "demo") {
      void hydrateStoresFromSupabase(token).then((r) => {
        if (r.ok) {
          console.info("[minarvabiz]", r.message, r.counts);
          phase6Store.refreshOperationalNotifications({ licenseDaysRemaining: phase9Store.getLicenseState().daysRemaining });
        } else {
          console.warn("[minarvabiz] Supabase hydration failed:", r.message);
          phase6Store.refreshOperationalNotifications({ licenseDaysRemaining: phase9Store.getLicenseState().daysRemaining, syncError: r.message });
        }
        refreshNotificationCount();
      });
    }
    phase6Store.refreshOperationalNotifications({ licenseDaysRemaining: phase9Store.getLicenseState().daysRemaining });
    refreshNotificationCount();
    const notificationTimer = window.setInterval(() => {
      phase6Store.refreshOperationalNotifications({ licenseDaysRemaining: phase9Store.getLicenseState().daysRemaining });
      refreshNotificationCount();
    }, 60000);
    return () => window.clearInterval(notificationTimer);
  }, [refreshNotificationCount]);
  const activeNav = pathToNav[pathname] ?? "dashboard";

  return (
    <AuthGate requireAuth={requireAuthByDefault}>
      <ToastProvider>
        <ErrorBoundary>
          {searchOpen && searchResults.length > 0 && (
            <div className="fixed left-1/2 top-16 z-[100] w-full max-w-lg -translate-x-1/2 rounded-xl border border-slate-200 bg-white shadow-xl">
              <ul className="max-h-80 overflow-auto py-2 text-sm">
                {searchResults.map((r) => (
                  <li key={r.kind + r.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col px-4 py-2 text-left hover:bg-slate-50"
                      onClick={() => {
                        setSearchOpen(false);
                        router.push(r.href);
                      }}
                    >
                      <span className="font-medium">{r.title}</span>
                      <span className="text-xs text-slate-500">
                        {r.kind} · {r.subtitle}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <AppShell
            activeNav={activeNav}
            onNavigate={(href) => router.push(href)}
            sidebar={{
              user: { name: userName || "Admin", role: "Super Admin" },
              logoSrc: "/logo-mark.png",
            }}
            header={{
              showSearch: pathname !== "/dashboard",
              onSearch: (q: string) => {
                if (!q.trim()) {
                  setSearchResults([]);
                  setSearchOpen(false);
                  return;
                }
                setSearchResults(globalSearch(q, 15));
                setSearchOpen(true);
              },
              title:
                pathname === "/dashboard"
                  ? "Dashboard"
                  : pathname.slice(1).replace(/^\w/, (c) => c.toUpperCase()),
              subtitle: userName ? `Welcome back, ${userName}!` : "Welcome back!",
              notificationCount: unreadNotifications,
              messageCount: 0,
              userName,
              onLogout: () => {
                clearSession();
                router.push("/login");
              },
              onNotificationsClick: () => {
                router.push("/notifications");
                refreshNotificationCount();
              },
            }}
          >
            <SetupBanner />
            {children}
          </AppShell>
        </ErrorBoundary>
      </ToastProvider>
    </AuthGate>
  );
}
