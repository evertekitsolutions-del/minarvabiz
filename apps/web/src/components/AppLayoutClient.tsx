"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { AppShell, AuthGate, ToastProvider, ErrorBoundary, type NavItemId } from "@minarvabiz/ui";
import {
  bootstrapFromLocalStorage, globalSearch,
  setCurrentRole,
  // remote hydrate is separate
  clearSession,
  getSessionUser,
} from "@minarvabiz/business-logic";
import { hydrateStoresFromSupabase } from "@/lib/data-source";
import { SetupBanner } from "@/components/SetupBanner";

const pathToNav: Record<string, NavItemId> = {
  "/dashboard": "dashboard",
  "/sales": "sales",
  "/quotations": "sales",
  "/cash-register": "reports",
  "/payments": "sales",
  "/services": "services",
  "/laundry": "laundry",
  "/expenses": "expenses",
  "/customers": "customers",
  "/staff": "staff",
  "/reports": "reports",
  "/notifications": "sms",
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
  "/suppliers": "expenses",
};

export function AppLayoutClient({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [searchResults, setSearchResults] = React.useState<Array<{kind:string;id:string;title:string;subtitle:string;href:string}>>([]);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [userName, setUserName] = React.useState<string | undefined>();
  React.useEffect(() => {
    bootstrapFromLocalStorage();
    void hydrateStoresFromSupabase().then((r) => {
      if (r.ok) console.info("[minarvabiz]", r.message, r.counts);
    });
    const u = getSessionUser();
    if (u) {
      setUserName(u.fullName || u.email);
      setCurrentRole(u.role as Parameters<typeof setCurrentRole>[0]);
    }
  }, []);
  const activeNav = pathToNav[pathname] ?? "dashboard";

  return (
    <AuthGate requireAuth={process.env.NEXT_PUBLIC_REQUIRE_AUTH === "true"}>
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
              user: { name: "Admin", role: "Super Admin" },
              logoSrc: "/logo.png",
            }}
            header={{
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
              notificationCount: 6,
              messageCount: 3,
              userName,
              onLogout: () => {
                clearSession();
                router.push("/login");
              },
              onNotificationsClick: () => router.push("/notifications"),
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
