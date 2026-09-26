/**
 * Shared navigation definition for Online + Offline shells.
 *
 * Main navigation is intentionally task-oriented: detail/CRM screens remain
 * routable, but are reached from their parent modules instead of duplicating
 * entries in the primary ERP sidebar.
 */

export type NavItemId =
  | "dashboard" | "sales" | "quotations" | "products" | "warehouse" | "services" | "laundry" | "expenses" | "purchases"
  | "customers" | "customer-crm" | "staff" | "staff-detail" | "suppliers" | "payments" | "accounting" | "returns"
  | "reports" | "day-end" | "audit" | "notifications" | "settings" | "backup" | "license";

export type NavSectionId =
  | "sales-operations"
  | "inventory-procurement"
  | "finance-reporting"
  | "team-communication"
  | "administration";

export interface NavItem {
  id: NavItemId;
  label: string;
  href: string;
  icon: string;
  section?: NavSectionId;
}

export interface NavSection {
  id: NavSectionId;
  label: string;
}

export const NAV_SECTIONS: NavSection[] = [
  { id: "sales-operations", label: "Sales & Operations" },
  { id: "inventory-procurement", label: "Inventory & Procurement" },
  { id: "finance-reporting", label: "Finance & Reporting" },
  { id: "team-communication", label: "Team & Communication" },
  { id: "administration", label: "Administration" },
];

export const MAIN_NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: "layout-dashboard" },

  { id: "sales", label: "Sales & Billing", href: "/sales", icon: "shopping-bag", section: "sales-operations" },
  { id: "quotations", label: "Quotations", href: "/quotations", icon: "file-text", section: "sales-operations" },
  { id: "returns", label: "Returns & Refunds", href: "/returns", icon: "shopping-bag", section: "sales-operations" },
  { id: "customers", label: "Customers", href: "/customers", icon: "users", section: "sales-operations" },
  { id: "services", label: "Services & Orders", href: "/services", icon: "scissors", section: "sales-operations" },
  { id: "laundry", label: "Laundry & Ironing", href: "/laundry", icon: "shirt", section: "sales-operations" },

  { id: "products", label: "Products & Inventory", href: "/products", icon: "package", section: "inventory-procurement" },
  { id: "warehouse", label: "Warehouse / WMS", href: "/warehouse", icon: "package", section: "inventory-procurement" },
  { id: "purchases", label: "Purchases", href: "/purchases", icon: "truck", section: "inventory-procurement" },
  { id: "suppliers", label: "Suppliers", href: "/suppliers", icon: "truck", section: "inventory-procurement" },

  { id: "payments", label: "Payments", href: "/payments", icon: "wallet", section: "finance-reporting" },
  { id: "expenses", label: "Expenses", href: "/expenses", icon: "wallet", section: "finance-reporting" },
  { id: "accounting", label: "Accounting", href: "/accounting", icon: "bar-chart-3", section: "finance-reporting" },
  { id: "day-end", label: "Day-end Close", href: "/day-end", icon: "bar-chart-3", section: "finance-reporting" },
  { id: "reports", label: "Reports & Analytics", href: "/reports", icon: "bar-chart-3", section: "finance-reporting" },

  { id: "staff", label: "Staff Management", href: "/staff", icon: "user-cog", section: "team-communication" },
  { id: "notifications", label: "Messages & Notifications", href: "/notifications", icon: "message-circle", section: "team-communication" },

  { id: "audit", label: "Audit Log", href: "/audit", icon: "bar-chart-3", section: "administration" },
  { id: "settings", label: "Settings", href: "/settings", icon: "settings", section: "administration" },
  { id: "backup", label: "Backup & Restore", href: "/backup", icon: "hard-drive", section: "administration" },
  { id: "license", label: "License & Renewal", href: "/license", icon: "key", section: "administration" },
];

export const DETAIL_NAV: NavItem[] = [
  { id: "customer-crm", label: "Customer CRM", href: "/customer-crm", icon: "users", section: "sales-operations" },
  { id: "staff-detail", label: "Staff Details", href: "/staff-detail", icon: "user-cog", section: "team-communication" },
];

export const ALL_NAV: NavItem[] = [...MAIN_NAV, ...DETAIL_NAV];

export const NAV_PARENT: Partial<Record<NavItemId, NavItemId>> = {
  "customer-crm": "customers",
  "staff-detail": "staff",
};

export function sidebarActiveNavId(id: NavItemId): NavItemId {
  return NAV_PARENT[id] ?? id;
}
