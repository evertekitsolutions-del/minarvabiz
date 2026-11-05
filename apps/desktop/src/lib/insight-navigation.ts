import type { NavItemId } from "@minarvabiz/ui";

/** Dashboard actions share one typed navigation table across desktop views. */
const targets: Readonly<Record<string, NavItemId>> = {
  "Review low stock": "products",
  "Open outstanding payments": "payments",
  "Review pending orders": "services",
  "Open ready orders": "services",
  "Open reports": "reports",
  "Review expenses": "expenses",
};

export function insightTarget(action: string): NavItemId | null {
  return targets[action] ?? null;
}
