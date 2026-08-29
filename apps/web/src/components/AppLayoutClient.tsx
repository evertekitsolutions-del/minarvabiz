"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { AppShell, type NavItemId } from "@minarvabiz/ui";

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
  "/backup": "backup",
  "/suppliers": "expenses",
};

export function AppLayoutClient({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const activeNav = pathToNav[pathname] ?? "dashboard";

  return (
    <AppShell
      activeNav={activeNav}
      onNavigate={(href) => router.push(href)}
      sidebar={{
        user: { name: "Admin", role: "Super Admin" },
        logoSrc: "/logo.png",
      }}
      header={{
        title: pathname === "/dashboard" ? "Dashboard" : pathname.slice(1).replace(/^\w/, (c) => c.toUpperCase()),
        subtitle: "Welcome back, Admin!",
        notificationCount: 6,
        messageCount: 3,
      }}
    >
      {children}
    </AppShell>
  );
}
