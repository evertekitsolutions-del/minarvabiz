"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { AppShell, AuthGate, ToastProvider, ErrorBoundary, type NavItemId } from "@minarvabiz/ui";
import {
  bootstrapFromLocalStorage,
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
    <AppShell
      activeNav={activeNav}
      onNavigate={(href) => router.push(href)}
      sidebar={{
        user: { name: "Admin", role: "Super Admin" },
        logoSrc: "/logo.png",
      }}
      header={{
        title: pathname === "/dashboard" ? "Dashboard" : pathname.slice(1).replace(/^\w/, (c) => c.toUpperCase()),
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
