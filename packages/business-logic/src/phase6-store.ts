/**
 * Phase 6: Staff, assignments, incentives, notifications, CRM helpers.
 */

import type {
  StaffMember, StaffAssignment, IncentiveRuleRecord, StaffIncentivePayout,
  AppNotification, CustomerCrmProfile, RoleName, StaffStatus, UUID, ServiceType,
} from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import { calculateIncentive } from "./incentives";
import * as mainStore from "./store";
import * as ordersStore from "./orders-store";

const staff: StaffMember[] = [
  {
    id: "staff-1", name: "Ravi Kumar", phone: "9876511111", role: "tailor",
    salary: 18000, status: "active", joiningDate: "2024-01-15",
    createdAt: nowISO(), updatedAt: nowISO(),
  },
  {
    id: "staff-2", name: "Meena Devi", phone: "9876522222", role: "tailor",
    salary: 16000, status: "active", joiningDate: "2024-03-01",
    createdAt: nowISO(), updatedAt: nowISO(),
  },
  {
    id: "staff-3", name: "Suresh Nair", phone: "9876533333", role: "cashier",
    salary: 14000, status: "active", joiningDate: "2023-11-10",
    createdAt: nowISO(), updatedAt: nowISO(),
  },
];

const assignments: StaffAssignment[] = [];
const incentiveRules: IncentiveRuleRecord[] = [
  {
    id: "rule-1", name: "Ladies tailoring fixed", serviceType: "ladies_tailoring",
    type: "fixed", value: 100, isActive: true, createdAt: nowISO(), updatedAt: nowISO(),
  },
  {
    id: "rule-2", name: "Wedding dress 5%", serviceType: "wedding_dress",
    type: "percentage", value: 5, isActive: true, createdAt: nowISO(), updatedAt: nowISO(),
  },
  {
    id: "rule-3", name: "T-shirt printing fixed", serviceType: "tshirt_printing",
    type: "fixed", value: 20, isActive: true, createdAt: nowISO(), updatedAt: nowISO(),
  },
];
const payouts: StaffIncentivePayout[] = [];
const notifications: AppNotification[] = [
  {
    id: "n-1", kind: "low_stock", title: "Low stock alert",
    body: "Cotton Thread (White) is below minimum (5 left)", href: "/inventory",
    read: false, createdAt: nowISO(),
  },
  {
    id: "n-2", kind: "order_ready", title: "Order ready",
    body: "An order is ready for delivery", href: "/services",
    read: false, createdAt: nowISO(),
  },
];

// ---- Staff ----
export function listStaff(opts?: { status?: StaffStatus; role?: string }): StaffMember[] {
  let list = staff.filter((s) => !s.deletedAt);
  if (opts?.status) list = list.filter((s) => s.status === opts.status);
  if (opts?.role) list = list.filter((s) => s.role === opts.role);
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

export function getStaff(id: UUID): StaffMember | undefined {
  return staff.find((s) => s.id === id && !s.deletedAt);
}

export function createStaff(input: {
  name: string;
  phone?: string | null;
  email?: string | null;
  role: RoleName | "tailor" | "staff";
  salary?: number;
  joiningDate?: string | null;
  notes?: string | null;
}): StaffMember {
  const m: StaffMember = {
    id: generateId(),
    name: input.name,
    phone: input.phone ?? null,
    email: input.email ?? null,
    role: input.role,
    salary: input.salary ?? 0,
    joiningDate: input.joiningDate ?? null,
    status: "active",
    notes: input.notes ?? null,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  staff.push(m);
  return m;
}

export function updateStaff(id: UUID, patch: Partial<StaffMember>): StaffMember | null {
  const m = getStaff(id);
  if (!m) return null;
  Object.assign(m, patch, { updatedAt: nowISO() });
  return m;
}

// ---- Assignments ----
export function listAssignments(opts?: { staffId?: UUID; orderId?: UUID }): StaffAssignment[] {
  let list = [...assignments];
  if (opts?.staffId) list = list.filter((a) => a.staffId === opts.staffId);
  if (opts?.orderId) list = list.filter((a) => a.orderId === opts.orderId);
  return list.sort((a, b) => b.assignedAt.localeCompare(a.assignedAt));
}

export function assignStaffToOrder(input: {
  staffId: UUID;
  orderId: UUID;
  notes?: string | null;
}): { assignment: StaffAssignment | null; errors: string[] } {
  const member = getStaff(input.staffId);
  if (!member) return { assignment: null, errors: ["Staff not found"] };
  const order = ordersStore.getOrder(input.orderId);
  if (!order) return { assignment: null, errors: ["Order not found"] };

  const existing = assignments.find(
    (a) => a.orderId === input.orderId && a.staffId === input.staffId && a.status !== "cancelled"
  );
  if (existing) return { assignment: null, errors: ["Already assigned"] };

  const a: StaffAssignment = {
    id: generateId(),
    staffId: input.staffId,
    staffName: member.name,
    orderId: input.orderId,
    orderNumber: order.orderNumber,
    serviceType: order.serviceType,
    assignedAt: nowISO(),
    status: "assigned",
    notes: input.notes ?? null,
  };
  assignments.push(a);

  // Reflect on order
  order.assignedTailorId = input.staffId;
  order.updatedAt = nowISO();
  order.version += 1;

  pushNotification({
    kind: "system",
    title: "Order assigned",
    body: `${order.orderNumber} assigned to ${member.name}`,
    href: "/services",
  });

  return { assignment: a, errors: [] };
}

export function completeAssignment(id: UUID): StaffAssignment | null {
  const a = assignments.find((x) => x.id === id);
  if (!a || a.status === "cancelled") return null;
  a.status = "completed";
  a.completedAt = nowISO();

  // Auto incentive
  const order = ordersStore.getOrder(a.orderId);
  if (order) {
    const rule = findRule(order.serviceType);
    if (rule) {
      const amount = calculateIncentive(order.price, {
        type: rule.type,
        value: rule.value,
        serviceType: rule.serviceType ?? undefined,
      });
      if (amount > 0) {
        payouts.push({
          id: generateId(),
          staffId: a.staffId,
          staffName: a.staffName,
          orderId: a.orderId,
          orderNumber: a.orderNumber,
          ruleId: rule.id,
          amount,
          calculatedAt: nowISO(),
          paid: false,
        });
      }
    }
  }
  return a;
}

// ---- Incentives ----
export function listIncentiveRules(): IncentiveRuleRecord[] {
  return incentiveRules.filter((r) => r.isActive);
}

export function upsertIncentiveRule(input: {
  id?: UUID;
  name: string;
  serviceType?: string | null;
  type: "fixed" | "percentage";
  value: number;
}): IncentiveRuleRecord {
  if (input.id) {
    const existing = incentiveRules.find((r) => r.id === input.id);
    if (existing) {
      Object.assign(existing, input, { updatedAt: nowISO() });
      return existing;
    }
  }
  const r: IncentiveRuleRecord = {
    id: generateId(),
    name: input.name,
    serviceType: input.serviceType ?? null,
    type: input.type,
    value: input.value,
    isActive: true,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  incentiveRules.push(r);
  return r;
}

export function listIncentivePayouts(staffId?: UUID): StaffIncentivePayout[] {
  let list = [...payouts];
  if (staffId) list = list.filter((p) => p.staffId === staffId);
  return list.sort((a, b) => b.calculatedAt.localeCompare(a.calculatedAt));
}

export function markIncentivePaid(id: UUID): StaffIncentivePayout | null {
  const p = payouts.find((x) => x.id === id);
  if (!p) return null;
  p.paid = true;
  p.paidAt = nowISO();
  return p;
}

function findRule(serviceType: ServiceType): IncentiveRuleRecord | undefined {
  return (
    incentiveRules.find((r) => r.isActive && r.serviceType === serviceType) ||
    incentiveRules.find((r) => r.isActive && !r.serviceType)
  );
}

export function staffProductivity(staffId: UUID) {
  const assigned = assignments.filter((a) => a.staffId === staffId);
  const completed = assigned.filter((a) => a.status === "completed");
  const incentives = payouts.filter((p) => p.staffId === staffId);
  const totalIncentive = incentives.reduce((s, p) => s + p.amount, 0);
  const unpaid = incentives.filter((p) => !p.paid).reduce((s, p) => s + p.amount, 0);
  return {
    assigned: assigned.length,
    completed: completed.length,
    totalIncentive,
    unpaidIncentive: unpaid,
  };
}

// ---- Notifications ----
export function listNotifications(unreadOnly = false): AppNotification[] {
  let list = [...notifications];
  if (unreadOnly) list = list.filter((n) => !n.read);
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function pushNotification(input: {
  kind: AppNotification["kind"];
  title: string;
  body: string;
  href?: string | null;
  meta?: Record<string, unknown>;
}): AppNotification {
  const n: AppNotification = {
    id: generateId(),
    kind: input.kind,
    title: input.title,
    body: input.body,
    href: input.href ?? null,
    read: false,
    createdAt: nowISO(),
    meta: input.meta,
  };
  notifications.unshift(n);
  return n;
}

export function markNotificationRead(id: UUID): void {
  const n = notifications.find((x) => x.id === id);
  if (n) n.read = true;
}

export function markAllNotificationsRead(): void {
  notifications.forEach((n) => { n.read = true; });
}

export function unreadNotificationCount(): number {
  return notifications.filter((n) => !n.read).length;
}

/** Notification service abstraction — providers plugged later */
export type NotificationChannel = "in_app" | "sms" | "whatsapp" | "email";

export interface NotificationPayload {
  channel: NotificationChannel;
  to: string;
  template: string;
  data: Record<string, string>;
}

export async function sendNotification(
  _payload: NotificationPayload
): Promise<{ ok: boolean; provider?: string; error?: string }> {
  // Architecture stub: real SMS/WhatsApp providers plug in here
  return { ok: true, provider: "noop" };
}

// ---- CRM ----
export function getCustomerCrmProfile(customerId: UUID): CustomerCrmProfile | null {
  const customer = mainStore.getCustomer(customerId);
  if (!customer) return null;

  const allOrders = ordersStore.listOrders({ customerId });
  const allSales = mainStore.listSales().filter((s) => s.customerId === customerId);
  const measurements = ordersStore.listMeasurementProfiles(customerId);

  return {
    customer,
    measurementCount: measurements.length,
    orderCount: allOrders.length,
    saleCount: allSales.length,
    recentOrders: allOrders.slice(0, 10).map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      price: o.price,
      date: o.orderDate,
    })),
    recentSales: allSales.slice(0, 10).map((s) => ({
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      total: s.total,
      date: s.saleDate,
    })),
  };
}


export function hydratePhase6(data: {
  staff?: StaffMember[];
  assignments?: StaffAssignment[];
  incentiveRules?: IncentiveRuleRecord[];
  payouts?: StaffIncentivePayout[];
  notifications?: AppNotification[];
}) {
  if (data.staff) {
    staff.length = 0;
    staff.push(...data.staff);
  }
  if (data.assignments) {
    assignments.length = 0;
    assignments.push(...data.assignments);
  }
  if (data.incentiveRules) {
    incentiveRules.length = 0;
    incentiveRules.push(...data.incentiveRules);
  }
  if (data.payouts) {
    payouts.length = 0;
    payouts.push(...data.payouts);
  }
  if (data.notifications) {
    notifications.length = 0;
    notifications.push(...data.notifications);
  }
}

