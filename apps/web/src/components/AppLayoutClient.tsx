"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { AppShell, AuthGate, ToastProvider, ErrorBoundary, type NavItemId } from "@minarvabiz/ui";
import {
  bootstrapFromLocalStorage, globalSearch,
  setCurrentRole,
  setSession,
  clearSession,
  getSessionUser,
  getSessionToken,
  phase6Store,
  phase9Store,
  listCustomerCommunicationQueue,
  getRuntimeMode,
  can,
  purgeExpiredRecycleBinItems,
  saveToLocalStorage,
} from "@minarvabiz/business-logic";
import { hydrateStoresFromSupabase, supabaseHydrationDomainsForPath, resolveOnlineAuthorization } from "@/lib/data-source";
import { isSupabaseConfigured } from "@minarvabiz/database";
import { SetupBanner } from "@/components/SetupBanner";

const requireAuthByDefault =
  process.env.NODE_ENV === "production"
    ? process.env.NEXT_PUBLIC_REQUIRE_AUTH !== "false"
    : process.env.NEXT_PUBLIC_REQUIRE_AUTH === "true";

const pathToNav: Record<string, NavItemId> = {
  "/dashboard": "dashboard",
  "/sales": "sales",
  "/warehouse": "warehouse",
  "/inventory": "products",
  "/variants": "products",
  "/quotations": "quotations",
  "/cash-register": "payments",
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
  "/messages": "messages",
  "/agenda": "agenda",
  "/support": "support",
  "/settings": "settings",
  "/users": "settings",
  "/onboarding": "dashboard",
  "/help": "settings",
  "/system": "settings",
  "/delivery": "services",
  "/stock-take": "warehouse",
  "/tools": "settings",
  "/license": "license",
  "/backup": "backup",
};

export function AppLayoutClient({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [searchResults, setSearchResults] = React.useState<Array<{kind:string;id:string;title:string;subtitle:string;href:string}>>([]);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [userName, setUserName] = React.useState<string | undefined>();
  const [unreadNotifications, setUnreadNotifications] = React.useState(0);
  const [messageAttentionCount, setMessageAttentionCount] = React.useState(0);

  const purgeTrashWhenAuthorized = React.useCallback(() => {
    if (!can("settings.manage")) return;
    try {
      const result = purgeExpiredRecycleBinItems();
      if (result.purged > 0) saveToLocalStorage();
    } catch {
      // Trash maintenance is best-effort until an authorized role is resolved.
    }
  }, []);

  const validateProtectedSession = React.useCallback(
    async (session: { token: string; user: { id: string; email?: string; fullName?: string; role?: string } }) => {
      if (getRuntimeMode() === "demo") return true;
      const authorization = await resolveOnlineAuthorization(session.token, session.user.id);
      if (!authorization.ok) return false;
      const authoritativeUser = {
        id: session.user.id,
        email: session.user.email || "",
        fullName: authorization.fullName,
        role: authorization.role,
      };
      setSession(session.token, authoritativeUser);
      setUserName(authoritativeUser.fullName || authoritativeUser.email);
      purgeTrashWhenAuthorized();
      return true;
    },
    [purgeTrashWhenAuthorized]
  );

  const refreshHeaderCounts = React.useCallback(() => {
    setUnreadNotifications(phase6Store.unreadNotificationCount());
    setMessageAttentionCount(
      listCustomerCommunicationQueue().filter((row) => row.status === "pending" || row.status === "failed").length
    );
  }, []);

  React.useEffect(() => {
    if (!searchOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSearchOpen(false);
        setSearchResults([]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchOpen]);

  React.useEffect(() => {
    bootstrapFromLocalStorage();
    const u = getSessionUser();
    const token = getSessionToken();
    const runtimeMode = getRuntimeMode();
    if (u) {
      setUserName(u.fullName || u.email);
      // Online roles are resolved from Supabase membership by AuthGate before
      // protected content is rendered. Never trust the sessionStorage role.
      if (isSupabaseConfigured()) setCurrentRole(null);
      else { setCurrentRole(u.role as Parameters<typeof setCurrentRole>[0]); purgeTrashWhenAuthorized(); }
    } else if (runtimeMode === "demo") {
      // Explicit demo mode is a non-production QA/demo environment. Give it an
      // admin role so the visible demo controls can execute real domain mutations.
      setUserName("Demo Admin");
      setCurrentRole("admin");
      purgeTrashWhenAuthorized();
    }
    phase6Store.refreshOperationalNotifications({ licenseDaysRemaining: phase9Store.getLicenseState().daysRemaining });
    refreshHeaderCounts();
    const notificationTimer = window.setInterval(() => {
      phase6Store.refreshOperationalNotifications({ licenseDaysRemaining: phase9Store.getLicenseState().daysRemaining });
      refreshHeaderCounts();
    }, 60000);
    return () => window.clearInterval(notificationTimer);
  }, [refreshHeaderCounts, purgeTrashWhenAuthorized]);

  React.useEffect(() => {
    if (getRuntimeMode() === "demo") return;
    const token = getSessionToken();
    const domains = supabaseHydrationDomainsForPath(pathname);
    let cancelled = false;

    void hydrateStoresFromSupabase(token, domains).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        console.info("[minarvabiz]", r.message, r.counts);
        phase6Store.refreshOperationalNotifications({ licenseDaysRemaining: phase9Store.getLicenseState().daysRemaining });
      } else {
        console.warn("[minarvabiz] Supabase hydration failed:", r.message);
        phase6Store.refreshOperationalNotifications({
          licenseDaysRemaining: phase9Store.getLicenseState().daysRemaining,
          syncError: r.message,
        });
      }
      refreshHeaderCounts();
    });

    return () => {
      cancelled = true;
    };
  }, [pathname, refreshHeaderCounts]);

  const activeNav = pathToNav[pathname] ?? "dashboard";

  return (
    <AuthGate
      requireAuth={requireAuthByDefault}
      validateSession={requireAuthByDefault ? validateProtectedSession : undefined}
    >
      <ToastProvider>
        <ErrorBoundary>
          {searchOpen && (
            <div
              className="fixed left-1/2 top-16 z-[100] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-slate-200 bg-white shadow-xl"
              role="region"
              aria-label="Global search results"
              aria-live="polite"
            >
              {searchResults.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500" role="status">No matching records found.</p>
              ) : (
              <ul className="max-h-80 overflow-auto py-2 text-sm">
                {searchResults.map((r) => (
                  <li key={r.kind + r.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col px-4 py-2 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
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
              )}
            </div>
          )}
          <AppShell
            activeNav={activeNav}
            onNavigate={(href) => router.push(href)}
            sidebar={{
              user: { name: userName || "User", role: "Authorized User" },
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
              messageCount: messageAttentionCount,
              userName,
              onLogout: () => {
                clearSession();
                router.push("/login");
              },
              onMessagesClick: () => {
                router.push("/messages");
                refreshHeaderCounts();
              },
              onNotificationsClick: () => {
                router.push("/notifications");
                refreshHeaderCounts();
              },
              onCalendarClick: () => {
                router.push("/agenda");
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
