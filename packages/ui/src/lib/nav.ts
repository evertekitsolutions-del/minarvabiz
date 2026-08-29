/**
 * Shared navigation definition for Online + Offline shells.
 */

export type NavItemId =
  | "dashboard"
  | "sales"
  | "services"
  | "laundry"
  | "expenses"
  | "customers"
  | "staff"
  | "reports"
  | "sms"
  | "settings"
  | "backup";

export interface NavItem {
  id: NavItemId;
  label: string;
  href: string;
  icon: string; // lucide-style name used by Sidebar
}

export const MAIN_NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: "layout-dashboard" },
  { id: "sales", label: "Sales & Inventory", href: "/sales", icon: "shopping-bag" },
  { id: "services", label: "Services & Orders", href: "/services", icon: "scissors" },
  { id: "laundry", label: "Laundry & Ironing", href: "/laundry", icon: "shirt" },
  { id: "expenses", label: "Expenses & Purchases", href: "/expenses", icon: "wallet" },
  { id: "customers", label: "Customers", href: "/customers", icon: "users" },
  { id: "staff", label: "Staff Management", href: "/staff", icon: "user-cog" },
  { id: "reports", label: "Reports & Analytics", href: "/reports", icon: "bar-chart-3" },
  { id: "sms", label: "SMS / WhatsApp", href: "/notifications", icon: "message-circle" },
  { id: "settings", label: "Settings", href: "/settings", icon: "settings" },
  { id: "backup", label: "Backup & Restore", href: "/backup", icon: "hard-drive" },
];
