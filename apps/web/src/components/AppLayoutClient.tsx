"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { AppShell, AuthGate, type NavItemId } from "@minarvabiz/ui";
import {
  bootstrapFromLocalStorage,
  clearSession,
  getSessionUser,
} from "@minarvabiz/business-logic";

const pathToNav: Record<string, NavItemId> = {
  "/dashboard": "dashboard",
  "/sales": "sales",
  "/services": "services",
  "/laundry": "laundry",
  "/expenses": "expenses",
  "/customers": "customers",
  "/staff": "staff",
  "/reports": "reports",
  "/notifications": "sms",
  "/settings": "settings",
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
    const u = getSessionUser();
    if (u) setUserName(u.fullName || u.email);
  }, []);
  const activeNav = pathToNav[pathname] ?? "dashboard";

  return (
    <AuthGate requireAuth={process.env.NEXT_PUBLIC_REQUIRE_AUTH === "true"}>
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
      {children}
    </AppShell>
    </AuthGate>
  );
}
