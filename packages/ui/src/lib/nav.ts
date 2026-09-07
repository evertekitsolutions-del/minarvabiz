/**
 * Shared navigation definition for Online + Offline shells.
 */

export type NavItemId =
  | "dashboard"
  | "sales"
  | "products"
  | "services"
  | "laundry"
  | "expenses"
  | "purchases"
  | "customers"
  | "staff"
  | "reports"
  | "sms"
  | "notifications"
  | "settings"
  | "backup";

export interface NavItem {
  id: NavItemId;
  label: string;
  href: string;
  icon: string;
}

export const MAIN_NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: "layout-dashboard" },
  { id: "sales", label: "Sales & Billing", href: "/sales", icon: "shopping-bag" },
  { id: "products", label: "Products & Inventory", href: "/products", icon: "package" },
  { id: "services", label: "Services & Orders", href: "/services", icon: "scissors" },
  { id: "laundry", label: "Laundry & Ironing", href: "/laundry", icon: "shirt" },
  { id: "expenses", label: "Expenses", href: "/expenses", icon: "wallet" },
  { id: "purchases", label: "Purchases", href: "/purchases", icon: "truck" },
  { id: "customers", label: "Customers", href: "/customers", icon: "users" },
  { id: "staff", label: "Staff Management", href: "/staff", icon: "user-cog" },
  { id: "reports", label: "Reports & Analytics", href: "/reports", icon: "bar-chart-3" },
  { id: "sms", label: "SMS / WhatsApp", href: "/notifications", icon: "message-circle" },
  { id: "notifications", label: "Notifications", href: "/notifications", icon: "bell" },
  { id: "settings", label: "Settings", href: "/settings", icon: "settings" },
  { id: "backup", label: "Backup & Restore", href: "/backup", icon: "hard-drive" },
];
