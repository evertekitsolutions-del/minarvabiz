import { Dashboard, type QuickAction } from "@minarvabiz/ui";
import { fetchDashboardData } from "@/lib/dashboard-data";

const quickActionIcons = {
  sale: (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57L22 7H6" />
    </svg>
  ),
  order: (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
    </svg>
  ),
  laundry: (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="12" cy="12" r="4" />
    </svg>
  ),
  expense: (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  ),
  purchase: (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57L22 7H6" />
    </svg>
  ),
  customer: (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  reports: (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3v18h18" /><path d="M18 17V9M13 17V5M8 17v-3" />
    </svg>
  ),
  sms: (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  ),
};

export default async function DashboardPage() {
  const data = await fetchDashboardData();

  const actions: QuickAction[] = [
    { id: "sale", label: "New Sale", description: "Create Invoice", icon: quickActionIcons.sale, tone: "blue" },
    { id: "order", label: "New Order", description: "Add Tailoring Order", icon: quickActionIcons.order, tone: "pink" },
    { id: "laundry", label: "Laundry In", description: "Add Laundry Item", icon: quickActionIcons.laundry, tone: "cyan" },
    { id: "expense", label: "Expense", description: "Add Expense", icon: quickActionIcons.expense, tone: "green" },
    { id: "purchase", label: "Purchase", description: "Add Purchase", icon: quickActionIcons.purchase, tone: "violet" },
    { id: "customer", label: "Customer", description: "Add New Customer", icon: quickActionIcons.customer, tone: "indigo" },
    { id: "reports", label: "Reports", description: "View Reports", icon: quickActionIcons.reports, tone: "emerald" },
    { id: "sms", label: "SMS / WhatsApp", description: "Send Message", icon: quickActionIcons.sms, tone: "teal" },
  ];

  return <Dashboard data={data} quickActions={actions} />;
}
