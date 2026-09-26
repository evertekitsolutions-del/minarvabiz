/**
 * Shared navigation definition for Online + Offline shells.
 */

export type NavItemId =
  | "dashboard" | "sales" | "quotations" | "products" | "warehouse" | "services" | "laundry" | "expenses" | "purchases"
  | "customers" | "customer-crm" | "staff" | "staff-detail" | "suppliers" | "payments" | "accounting" | "returns"
  | "reports" | "day-end" | "audit" | "notifications" | "settings" | "backup" | "license";

export interface NavItem { id: NavItemId; label: string; href: string; icon: string; }

export const MAIN_NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: "layout-dashboard" },
  { id: "sales", label: "Sales & Billing", href: "/sales", icon: "shopping-bag" },
  { id: "quotations", label: "Quotations", href: "/quotations", icon: "file-text" },
  { id: "products", label: "Products & Inventory", href: "/products", icon: "package" },
  { id: "warehouse", label: "Warehouse / WMS", href: "/warehouse", icon: "package" },
  { id: "services", label: "Services & Orders", href: "/services", icon: "scissors" },
  { id: "laundry", label: "Laundry & Ironing", href: "/laundry", icon: "shirt" },
  { id: "expenses", label: "Expenses", href: "/expenses", icon: "wallet" },
  { id: "purchases", label: "Purchases", href: "/purchases", icon: "truck" },
  { id: "customers", label: "Customers", href: "/customers", icon: "users" },
  { id: "customer-crm", label: "Customer CRM", href: "/customer-crm", icon: "users" },
  { id: "staff", label: "Staff Management", href: "/staff", icon: "user-cog" },
  { id: "staff-detail", label: "Staff Details", href: "/staff-detail", icon: "user-cog" },
  { id: "suppliers", label: "Suppliers", href: "/suppliers", icon: "truck" },
  { id: "payments", label: "Payments", href: "/payments", icon: "wallet" },
  { id: "accounting", label: "Accounting", href: "/accounting", icon: "bar-chart-3" },
  { id: "returns", label: "Returns & Refunds", href: "/returns", icon: "shopping-bag" },
  { id: "reports", label: "Reports & Analytics", href: "/reports", icon: "bar-chart-3" },
  { id: "day-end", label: "Day-end Close", href: "/day-end", icon: "bar-chart-3" },
  { id: "audit", label: "Audit Log", href: "/audit", icon: "bar-chart-3" },
  { id: "notifications", label: "Messages & Notifications", href: "/notifications", icon: "message-circle" },
  { id: "settings", label: "Settings", href: "/settings", icon: "settings" },
  { id: "backup", label: "Backup & Restore", href: "/backup", icon: "hard-drive" },
  { id: "license", label: "License & Renewal", href: "/license", icon: "key" },
];
