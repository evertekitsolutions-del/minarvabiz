import { planDirectPurchasePosting, planSupplierPaymentPosting } from "./procurement-accounting";
import { assertPermission } from "./permissions";
import { enqueueOutbox } from "./outbox-bridge";
import { remoteCreateSupplier, remoteUpsertSupplier, remoteCreateLaundry, remoteCreatePurchase, remoteSupplierSettlement, remoteUpsertCustomer } from "./remote-write";
import type { Supplier, LaundryOrder, Expense, ExpenseCategory, Purchase, PaymentMethod, UUID } from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import { calculateLaundryProfit } from "./laundry";
import { hasLaundryPosting, planLaundryCancellation, planLaundryPosting } from "./laundry-accounting";
import { purchaseBalance, nextDocNumber } from "./expenses";
import * as mainStore from "./store";
import * as ordersStore from "./orders-store";
import { planAutomaticPosting, planExpenseReversal, postExpenseJournal } from "./accounting-store";
import { listPurchaseInvoices, prepareSupplierInvoiceSettlements } from "./procurement-store";
import { auditAction } from "./audit-actions";
import { touchPersistence } from "./autosave";

const suppliers: Supplier[] = [
  { id: "sup-1", name: "City Laundry Works", company: "CLW", phone: "9800011111", category: "laundry", openingBalance: 0, outstandingBalance: 0, createdAt: nowISO(), updatedAt: nowISO() },
  { id: "sup-2", name: "Thread & Co.", company: "T&C Supplies", phone: "9800022222", category: "materials", openingBalance: 0, outstandingBalance: 0, createdAt: nowISO(), updatedAt: nowISO() },
];
const expenseCategories: ExpenseCategory[] = [
  { id: "ec-1", name: "Salary", isSystem: true, createdAt: nowISO() }, { id: "ec-2", name: "Electricity", isSystem: true, createdAt: nowISO() },
  { id: "ec-3", name: "Rent", isSystem: true, createdAt: nowISO() }, { id: "ec-4", name: "Normal Water", isSystem: true, createdAt: nowISO() },
  { id: "ec-5", name: "Drinking Water", isSystem: true, createdAt: nowISO() }, { id: "ec-6", name: "Shop Supplies", isSystem: true, createdAt: nowISO() },
  { id: "ec-7", name: "Transportation", isSystem: true, createdAt: nowISO() }, { id: "ec-8", name: "Maintenance", isSystem: true, createdAt: nowISO() },
  { id: "ec-9", name: "Other", isSystem: true, createdAt: nowISO() },
];
const laundryOrders: LaundryOrder[] = [];
const expenses: Expense[] = [];
const purchases: Purchase[] = [];
let lastLaundryNo: string | null = null;
let lastPurchaseNo: string | null = null;

export function listSuppliers(query?: string): Supplier[] { let list = suppliers.filter((s) => !s.deletedAt); if (query?.trim()) { const q = query.toLowerCase(); list = list.filter((s) => s.name.toLowerCase().includes(q) || s.company?.toLowerCase().includes(q) || s.phone?.includes(q)); } return list.sort((a,b)=>a.name.localeCompare(b.name)); }
export function getSupplier(id: UUID): Supplier | undefined { return suppliers.find((s) => s.id === id && !s.deletedAt); }
export function createSupplier(input: { name: string; company?: string | null; phone?: string | null; email?: string | null; address?: string | null; category?: string | null; notes?: string | null; openingBalance?: number; }): Supplier {
  assertPermission("purchases.manage");
  const rawOpeningBalance = input.openingBalance ?? 0;
  if (!Number.isFinite(rawOpeningBalance) || rawOpeningBalance < 0 || !Number.isSafeInteger(Math.round(rawOpeningBalance * 100))) {
    throw new Error("Opening supplier balance must be a finite non-negative amount");
  }
  const openingBalance = r2(rawOpeningBalance);
  const id = generateId();
  const posting = openingBalance > 0
    ? planAutomaticPosting({
        referenceType: "auto_opening_supplier",
        referenceId: "opening-supplier-create-" + id,
        date: nowISO(),
        description: "Opening supplier balance: " + input.name,
        lines: [
          { key: "opening_balance_equity", debit: openingBalance },
          { key: "accounts_payable", credit: openingBalance },
        ],
      })
    : null;
  if (posting?.errors.length) throw new Error(posting.errors.join("; "));

  const s: Supplier = {
    id,
    name: input.name,
    company: input.company ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    address: input.address ?? null,
    category: input.category ?? null,
    openingBalance,
    outstandingBalance: openingBalance,
    notes: input.notes ?? null,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  suppliers.push(s);
  if (posting && !posting.commit()) {
    suppliers.splice(suppliers.findIndex((supplier) => supplier.id === s.id), 1);
    throw new Error("Opening supplier balance posting failed");
  }
  touchPersistence();
  void remoteCreateSupplier(s);
  return s;
}

export function listSupplierPayments(supplierId?: UUID) {
  return mainStore.listPayments()
    .filter((payment) => payment.referenceType === "supplier" && (!supplierId || payment.referenceId === supplierId))
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}

export function recordSupplierPayment(input: {
  supplierId: UUID; amount: number; paymentMethod: PaymentMethod; date?: string;
  reference?: string | null; notes?: string | null; purchaseInvoiceId?: UUID;
}): { payment: ReturnType<typeof mainStore.recordSupplierPaymentEntry> | null; supplier: Supplier | null; errors: string[] } {
  assertPermission("purchases.manage");
  const supplier = getSupplier(input.supplierId);
  const errors: string[] = [];
  const date = input.date || nowISO();
  const day = date.slice(0, 10);
  if (!supplier) errors.push("Supplier not found");
  if (!Number.isFinite(input.amount) || r2(input.amount) <= 0 || !Number.isSafeInteger(Math.round(input.amount * 100))) errors.push("Amount must be positive and finite");
  if (!["cash", "bank", "card", "upi", "online", "other"].includes(input.paymentMethod)) errors.push("Invalid payment method");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(date)) || new Date(day).toISOString().slice(0, 10) !== day) errors.push("Invalid payment date");
  if (supplier && (!Number.isFinite(supplier.outstandingBalance) || r2(supplier.outstandingBalance) <= 0 || !Number.isSafeInteger(Math.round(supplier.outstandingBalance * 100)))) errors.push("Supplier has no valid outstanding balance");
  if (errors.length || !supplier) return { payment: null, supplier: null, errors };
  const invoices = listPurchaseInvoices(supplier.id).filter(i => ["posted", "partially_paid"].includes(i.status) && i.balanceAmount > 0);
  const selected = input.purchaseInvoiceId ? invoices.find(i => i.id === input.purchaseInvoiceId) : undefined;
  if (input.purchaseInvoiceId && !selected) return { payment: null, supplier: null, errors: ["Selected supplier invoice is not payable"] };
  const candidates = [
    ...invoices.map(i => ({ id: i.id, type: "invoice" as const, date: i.invoiceDate, number: i.invoiceNumber, total: i.total, paid: i.paidAmount, balance: i.balanceAmount })),
    ...purchases.filter(p => !p.deletedAt && p.supplierId === supplier.id && p.balanceAmount > 0).map(p => ({ id: p.id, type: "purchase" as const, date: p.date, number: p.purchaseNumber, total: p.amount, paid: p.paidAmount, balance: p.balanceAmount })),
  ].filter(c => !selected || (c.type === "invoice" && c.id === selected.id))
    .sort((a, b) => a.date.slice(0, 10).localeCompare(b.date.slice(0, 10)) || a.id.localeCompare(b.id));
  const applied = r2(Math.min(input.amount, supplier.outstandingBalance, selected?.balanceAmount ?? Infinity));
  let remaining = applied;
  const allocations: Array<{ id: UUID; type: "invoice" | "purchase"; amount: number; number: string }> = [];
  for (const candidate of candidates) {
    if (remaining <= 0) break;
    if (![candidate.total, candidate.paid, candidate.balance].every(n => Number.isFinite(n) && n >= 0 && Number.isSafeInteger(Math.round(n * 100)))
      || r2(candidate.paid + candidate.balance) !== r2(candidate.total)) return { payment: null, supplier: null, errors: ["Document balances need reconciliation: " + candidate.number] };
    const amount = r2(Math.min(candidate.balance, remaining));
    allocations.push({ ...candidate, amount }); remaining = r2(remaining - amount);
  }
  const invoicePlan = prepareSupplierInvoiceSettlements(supplier.id, allocations.filter(a => a.type === "invoice"));
  if (invoicePlan.errors.length) return { payment: null, supplier: null, errors: invoicePlan.errors };
  const allocationNotes = allocations.length ? "Documents: " + allocations.map(a => `${a.number} ${a.amount.toFixed(2)}`).join(", ") : null;
  const paymentId = generateId();
  const posting = planSupplierPaymentPosting({ id: paymentId, amount: applied, method: input.paymentMethod, date, allocations });
  if (posting.errors.length) return { payment: null, supplier: null, errors: posting.errors };
  const payment = mainStore.recordSupplierPaymentEntry({ supplierId: supplier.id, amount: applied, method: input.paymentMethod, paidAt: date,
    reference: input.reference, notes: [input.notes, allocationNotes, remaining > 0 ? `Other supplier balance: ${remaining.toFixed(2)}` : null].filter(Boolean).join(" · "), deferRemote: true, paymentId });
  supplier.outstandingBalance = r2(Math.max(0, supplier.outstandingBalance - applied)); supplier.updatedAt = nowISO();
  const settledInvoices = invoicePlan.commit();
  const settledPurchases: Purchase[] = [];
  for (const allocation of allocations.filter(a => a.type === "purchase")) {
    const purchase = purchases.find(p => p.id === allocation.id)!;
    const before = { ...purchase };
    purchase.paidAmount = r2(purchase.paidAmount + allocation.amount); purchase.balanceAmount = r2(purchase.amount - purchase.paidAmount);
    purchase.updatedAt = nowISO(); purchase.version = (purchase.version || 1) + 1;
    settledPurchases.push({ ...purchase });
    auditAction("purchase.payment", "purchases", purchase.id, before, purchase);
  }
  posting.commit();
  void remoteSupplierSettlement({ ...payment }, { ...supplier }, settledInvoices, settledPurchases);
  auditAction("supplier.payment.allocate", "suppliers", supplier.id, null, { paymentId: payment.id, allocations, otherBalanceAmount: remaining });
  touchPersistence();
  return { payment, supplier, errors: [] };
}
export function listLaundryOrders(opts?: { mode?: "outsourced"|"in_house_ironing"; query?: string }): LaundryOrder[] { let list=laundryOrders.filter(o=>!o.deletedAt);if(opts?.mode)list=list.filter(o=>o.mode===opts.mode);if(opts?.query?.trim()){const q=opts.query.toLowerCase();list=list.filter(o=>o.orderNumber.toLowerCase().includes(q)||o.customerName?.toLowerCase().includes(q)||o.garment?.toLowerCase().includes(q));}return list.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)); }
export function createLaundryOrder(input: { customerId: UUID; garment?: string|null; quantity:number; mode:"outsourced"|"in_house_ironing"; supplierId?: UUID|null; supplierRate:number; customerRate:number; notes?:string|null; paidAmount?:number; paymentMethod?:PaymentMethod }): {order:LaundryOrder|null;errors:string[]} {
  assertPermission("orders.manage");
  const errors:string[]=[];
  const quantity=Number(input.quantity), customerRate=Number(input.customerRate), rawSupplierRate=Number(input.supplierRate), paidInput=Number(input.paidAmount??0);
  if(!input.customerId) errors.push("Customer is required");
  if(!["outsourced","in_house_ironing"].includes(input.mode)) errors.push("Invalid laundry mode");
  if(!Number.isFinite(quantity)||quantity<=0||!Number.isSafeInteger(Math.round(quantity*1000))) errors.push("Quantity must be positive and finite");
  if(!Number.isFinite(customerRate)||customerRate<0||!Number.isSafeInteger(Math.round(customerRate*100))) errors.push("Customer rate must be a finite non-negative amount");
  if(!Number.isFinite(rawSupplierRate)||rawSupplierRate<0||!Number.isSafeInteger(Math.round(rawSupplierRate*100))) errors.push("Supplier rate must be a finite non-negative amount");
  if(!Number.isFinite(paidInput)||paidInput<0||!Number.isSafeInteger(Math.round(paidInput*100))) errors.push("Paid amount must be a finite non-negative amount");
  if(input.mode==="outsourced"&&!input.supplierId) errors.push("Supplier is required for outsourced laundry");
  const paymentMethod=(input.paymentMethod??"cash") as PaymentMethod;
  if(!["cash","bank","card","upi","online","other"].includes(paymentMethod)) errors.push("Invalid payment method");
  if(errors.length) return {order:null,errors};

  const customer=mainStore.getCustomer(input.customerId);
  if(!customer) return {order:null,errors:["Customer not found"]};
  const supplierRate=input.mode==="in_house_ironing"?0:rawSupplierRate;
  const calc=calculateLaundryProfit({customerRate,supplierRate,quantity});
  if(![calc.totalCustomerCharge,calc.totalSupplierCost,calc.totalProfit].every(Number.isFinite)
    || ![calc.totalCustomerCharge,calc.totalSupplierCost].every(v=>Number.isSafeInteger(Math.round(v*100)))) {
    return {order:null,errors:["Laundry totals are out of range"]};
  }
  const supplier=input.mode==="outsourced"&&input.supplierId?getSupplier(input.supplierId):undefined;
  if(input.mode==="outsourced"&&!supplier) return {order:null,errors:["Supplier not found"]};
  const paid=r2(Math.min(paidInput,calc.totalCustomerCharge));
  const balance=r2(calc.totalCustomerCharge-paid);
  if(!Number.isFinite(customer.outstandingBalance)||customer.outstandingBalance<0
    || !Number.isSafeInteger(Math.round((customer.outstandingBalance+balance)*100))) {
    return {order:null,errors:["Customer balance needs reconciliation"]};
  }
  if(supplier&&(!Number.isFinite(supplier.outstandingBalance)||supplier.outstandingBalance<0
    || !Number.isSafeInteger(Math.round((supplier.outstandingBalance+calc.totalSupplierCost)*100)))) {
    return {order:null,errors:["Supplier balance needs reconciliation"]};
  }

  const orderNumber=nextDocNumber(lastLaundryNo,"LDY");
  const now=nowISO();
  const order:LaundryOrder={
    id:generateId(),orderNumber,customerId:input.customerId,customerName:customer.name,
    garment:input.garment??null,quantity,mode:input.mode,supplierId:input.mode==="outsourced"?(input.supplierId??null):null,
    supplierName:supplier?.name??null,supplierRate,customerRate,profit:calc.totalProfit,
    totalCustomerCharge:calc.totalCustomerCharge,totalSupplierCost:calc.totalSupplierCost,
    status:input.mode==="in_house_ironing"?"delivered":"pending",notes:input.notes??null,
    paidAmount:paid,balanceAmount:balance,createdAt:now,updatedAt:now,version:1
  };
  const accountingPlan=planLaundryPosting(order,paymentMethod);
  if(accountingPlan.errors.length) return {order:null,errors:accountingPlan.errors};

  lastLaundryNo=orderNumber;
  if(balance>0) customer.outstandingBalance=r2(customer.outstandingBalance+balance);
  if(paid>0) customer.totalSpending=r2(customer.totalSpending+paid);
  customer.updatedAt=now;
  if(supplier&&calc.totalSupplierCost>0){
    supplier.outstandingBalance=r2(supplier.outstandingBalance+calc.totalSupplierCost);
    supplier.updatedAt=now;
  }
  laundryOrders.push(order);
  accountingPlan.commit();
  if (paid > 0) {
    mainStore.recordLaundryPaymentEntry({
      laundryOrderId: order.id,
      customerId: order.customerId,
      amount: paid,
      method: paymentMethod,
      paidAt: order.createdAt,
      orderNumber: order.orderNumber,
    });
  }
  touchPersistence();
  void remoteCreateLaundry({...order});
  void remoteUpsertCustomer({...customer});
  if(supplier) void remoteUpsertSupplier({...supplier});
  auditAction("laundry.create","laundry_orders",order.id,null,{
    orderNumber:order.orderNumber,customerId:order.customerId,supplierId:order.supplierId??null,
    totalCustomerCharge:order.totalCustomerCharge,totalSupplierCost:order.totalSupplierCost,
    paidAmount:order.paidAmount,balanceAmount:order.balanceAmount,paymentMethod
  });
  return {order,errors:[]};
}

export function cancelLaundryOrder(input: {
  orderId: UUID;
  refundPaymentMethod?: PaymentMethod;
  supplierCostAction?: "keep" | "reverse";
}): { order: LaundryOrder | null; errors: string[] } {
  assertPermission("orders.manage");
  const order = laundryOrders.find((item) => item.id === input.orderId && !item.deletedAt);
  if (!order) return { order: null, errors: ["Laundry order not found"] };
  if (order.status === "cancelled") return { order: null, errors: ["Laundry order is already cancelled"] };

  const customer = mainStore.getCustomer(order.customerId);
  if (!customer || !Number.isFinite(customer.outstandingBalance) || customer.outstandingBalance < order.balanceAmount
    || !Number.isSafeInteger(Math.round(customer.outstandingBalance * 100))
    || !Number.isFinite(customer.totalSpending) || customer.totalSpending < order.paidAmount
    || !Number.isSafeInteger(Math.round(customer.totalSpending * 100))) {
    return { order: null, errors: ["Customer balance needs reconciliation before laundry cancellation"] };
  }

  const sourcePayments = mainStore.listPayments().filter((payment) =>
    payment.referenceType === "laundry"
    && payment.referenceId === order.id
    && payment.customerId === order.customerId
  );
  if (sourcePayments.length > 1 || sourcePayments.some((payment) =>
    !Number.isFinite(payment.amount) || payment.amount <= 0
    || !Number.isSafeInteger(Math.round(payment.amount * 100))
    || !["cash", "bank", "card", "upi", "online", "other"].includes(payment.method)
  )) {
    return { order: null, errors: ["Laundry receipt source needs reconciliation before cancellation"] };
  }
  const initialReceiptAmount = r2(sourcePayments.reduce((sum, payment) => sum + payment.amount, 0));
  let allocatedCollectionAmount = 0;
  for (const payment of mainStore.listPayments()) {
    if (payment.customerId !== order.customerId || payment.referenceType !== "other" || payment.paidAt < order.createdAt) continue;
    const allocation = laundryAllocationFromPayment(payment.notes ?? "", order.orderNumber);
    if (allocation == null) return { order: null, errors: ["Laundry collection source needs reconciliation before cancellation"] };
    allocatedCollectionAmount = r2(allocatedCollectionAmount + allocation);
  }
  if (r2(initialReceiptAmount + allocatedCollectionAmount) !== r2(order.paidAmount)) {
    return { order: null, errors: ["Laundry receipt and collection sources need reconciliation before cancellation"] };
  }
  if (order.paidAmount > 0 && !input.refundPaymentMethod) {
    return { order: null, errors: ["Refund method is required for the laundry paid-to-date amount before cancellation"] };
  }

  const hasUnallocatedCustomerCollection = mainStore.listPayments().some((payment) =>
    payment.customerId === order.customerId
    && payment.referenceType === "other"
    && payment.paidAt >= order.createdAt
    && /Other customer balance:/i.test(payment.notes ?? "")
  );
  if (hasUnallocatedCustomerCollection) {
    return { order: null, errors: ["Customer collections need allocation before laundry cancellation"] };
  }

  let supplier: Supplier | undefined;
  if (order.totalSupplierCost > 0) {
    if (!["keep", "reverse"].includes(input.supplierCostAction ?? "")) {
      return { order: null, errors: ["Select how to handle the laundry supplier cost"] };
    }
    if (input.supplierCostAction === "reverse") {
      if (!order.supplierId) return { order: null, errors: ["Laundry supplier source needs reconciliation"] };
      supplier = getSupplier(order.supplierId);
      if (!supplier || !Number.isFinite(supplier.outstandingBalance)
        || supplier.outstandingBalance < order.totalSupplierCost
        || !Number.isSafeInteger(Math.round(supplier.outstandingBalance * 100))) {
        return { order: null, errors: ["Supplier balance needs reconciliation before reversing laundry cost"] };
      }
      const hasUnallocatedSupplierPayment = mainStore.listPayments().some((payment) =>
        payment.referenceType === "supplier"
        && payment.referenceId === supplier!.id
        && payment.paidAt >= order.createdAt
        && /Other supplier balance:/i.test(payment.notes ?? "")
      );
      if (hasUnallocatedSupplierPayment) {
        return { order: null, errors: ["Supplier payments need allocation before reversing laundry cost"] };
      }
    }
  }

  const reversal = planLaundryCancellation(order, input.refundPaymentMethod, input.supplierCostAction);
  if (reversal.errors.length) return { order: null, errors: reversal.errors };

  const beforeOrder = { ...order };
  const beforeCustomer = { ...customer };
  const beforeSupplier = supplier ? { ...supplier } : null;
  const now = nowISO();

  customer.outstandingBalance = r2(customer.outstandingBalance - order.balanceAmount);
  customer.totalSpending = r2(customer.totalSpending - order.paidAmount);
  customer.updatedAt = now;

  if (supplier && input.supplierCostAction === "reverse") {
    supplier.outstandingBalance = r2(supplier.outstandingBalance - order.totalSupplierCost);
    supplier.updatedAt = now;
  }

  order.status = "cancelled";
  order.updatedAt = now;
  order.version += 1;
  reversal.commit();

  const refundPayment = order.paidAmount > 0 && input.refundPaymentMethod
    ? mainStore.recordLaundryRefundPaymentEntry({
        laundryOrderId: order.id,
        customerId: order.customerId,
        amount: order.paidAmount,
        method: input.refundPaymentMethod,
        refundedAt: now,
        orderNumber: order.orderNumber,
      })
    : null;

  enqueueOutbox("laundry_orders", order.id, "update", { ...order });
  void remoteUpsertCustomer({ ...customer });
  if (supplier && input.supplierCostAction === "reverse") void remoteUpsertSupplier({ ...supplier });
  auditAction("laundry.cancel", "laundry_orders", order.id, beforeOrder, {
    order: { ...order },
    refundPaymentId: refundPayment?.id ?? null,
    refundAmount: refundPayment?.amount ?? 0,
    refundPaymentMethod: refundPayment?.method ?? null,
    supplierCostAction: input.supplierCostAction ?? null,
    customerOutstandingBefore: beforeCustomer.outstandingBalance,
    customerOutstandingAfter: customer.outstandingBalance,
    customerSpendingBefore: beforeCustomer.totalSpending,
    customerSpendingAfter: customer.totalSpending,
    supplierOutstandingBefore: beforeSupplier?.outstandingBalance ?? null,
    supplierOutstandingAfter: supplier?.outstandingBalance ?? null,
  });
  touchPersistence();
  return { order: { ...order }, errors: [] };
}

export function updateLaundryStatus(
  id: UUID,
  status: LaundryOrder["status"]
): { order: LaundryOrder | null; error?: string } {
  assertPermission("orders.manage");
  const order = laundryOrders.find((item) => item.id === id && !item.deletedAt);
  if (!order) return { order: null, error: "Laundry order not found" };
  if (status === "cancelled") {
    return { order: null, error: "Laundry cancellation requires a separate refund/reconciliation workflow" };
  }
  if (order.mode === "in_house_ironing") {
    return { order: null, error: "In-house ironing is completed at creation" };
  }
  const next: Partial<Record<LaundryOrder["status"], LaundryOrder["status"]>> = {
    pending: "sent",
    sent: "received",
    received: "delivered",
  };
  if (next[order.status] !== status) {
    return { order: null, error: `Cannot change laundry status from ${order.status} to ${status}` };
  }
  const before = { status: order.status, updatedAt: order.updatedAt, version: order.version };
  order.status = status;
  order.updatedAt = nowISO();
  order.version += 1;
  touchPersistence();
  enqueueOutbox("laundry_orders", order.id, "update", { ...order });
  auditAction("laundry.status", "laundry_orders", order.id, before, {
    status: order.status,
    version: order.version,
  });
  return { order };
}
export function listExpenseCategories():ExpenseCategory[]{return[...expenseCategories];}
export function createExpenseCategory(name:string):ExpenseCategory{assertPermission("expenses.manage");const c:ExpenseCategory={id:generateId(),name,isSystem:false,createdAt:nowISO()};expenseCategories.push(c);touchPersistence();enqueueOutbox("expense_categories",c.id,"insert",c);return c;}
export function listExpenses(opts?:{orderId?:UUID}):Expense[]{let list=expenses.filter(e=>!e.deletedAt);if(opts?.orderId)list=list.filter(e=>e.orderId===opts.orderId);return list.sort((a,b)=>b.date.localeCompare(a.date));}
export function createExpense(input: { date?: string; categoryId: UUID; amount: number; paymentMethod: PaymentMethod; description?: string | null; reference?: string | null; receiptUrl?: string | null; staffId?: UUID | null; orderId?: UUID | null }): { expense: Expense | null; errors: string[] } {
  assertPermission("expenses.manage");
  const errors: string[] = [];
  if (!Number.isFinite(input.amount) || r2(input.amount) <= 0) errors.push("Amount must be positive and finite");
  const cat = expenseCategories.find((category) => category.id === input.categoryId);
  if (!cat) errors.push("Category required");
  if (errors.length) return { expense: null, errors };
  let orderNumber: string | null = null;
  if (input.orderId) {
    assertPermission("orders.manage");
    const order = ordersStore.getOrder(input.orderId);
    if (!order) return { expense: null, errors: ["Order not found"] };
    orderNumber = order.orderNumber;
  }
  const expense: Expense = { id: generateId(), date: input.date || nowISO(), categoryId: input.categoryId, categoryName: cat!.name,
    amount: r2(input.amount), paymentMethod: input.paymentMethod, description: input.description ?? null, reference: input.reference ?? null,
    receiptUrl: input.receiptUrl ?? null, staffId: input.staffId ?? null, orderId: input.orderId ?? null, orderNumber,
    createdAt: nowISO(), updatedAt: nowISO(), version: 1 };
  // No persistence/outbox side effects until the journal passes validation.
  expenses.push(expense);
  const posting = postExpenseJournal(expense);
  if (posting.errors.length) { expenses.pop(); return { expense: null, errors: posting.errors }; }
  if (input.orderId) {
    const linked = ordersStore.addOrderExpense(input.orderId, input.description || "Expense", expense.amount, expense.id);
    if (!linked.order) return { expense: null, errors: [linked.error || "Unable to link order expense"] };
  }
  touchPersistence();
  return { expense, errors: [] };
}

export function reverseExpense(id: UUID): { expense: Expense | null; errors: string[] } {
  assertPermission("expenses.manage");
  const expense = expenses.find((item) => item.id === id);
  if (!expense || expense.deletedAt) return { expense: null, errors: ["Expense not found"] };
  if (!Number.isFinite(expense.amount) || r2(expense.amount) <= 0 || !Number.isSafeInteger(Math.round(expense.amount * 100))) {
    return { expense: null, errors: ["Expense amount needs reconciliation"] };
  }
  if (expense.orderId) {
    assertPermission("orders.manage");
    const order = ordersStore.getOrder(expense.orderId);
    const linked = order?.expenses.find((item) => item.id === expense.id);
    if (!order || !linked || r2(linked.amount) !== r2(expense.amount)) {
      return { expense: null, errors: ["Order-linked expense needs source reconciliation before reversal"] };
    }
  }
  const reversal = planExpenseReversal(expense);
  if (reversal.errors.length) return { expense: null, errors: reversal.errors };

  const before = { ...expense };
  if (expense.orderId) {
    const rolledBack = ordersStore.removeOrderExpense(expense.orderId, expense.id, expense.amount);
    if (!rolledBack.order) return { expense: null, errors: [rolledBack.error || "Unable to reverse linked order expense"] };
  }
  const now = nowISO();
  expense.deletedAt = now;
  expense.updatedAt = now;
  expense.version = (expense.version || 1) + 1;
  reversal.commit();
  enqueueOutbox("expenses", expense.id, "update", { ...expense });
  auditAction("expense.reverse", "expenses", expense.id, before, {
    deletedAt: expense.deletedAt,
    version: expense.version,
    orderId: expense.orderId ?? null,
  });
  touchPersistence();
  return { expense: { ...expense }, errors: [] };
}
export function listPurchases(opts?:{kind?:"general"|"order_specific"}):Purchase[]{let list=purchases.filter(p=>!p.deletedAt);if(opts?.kind)list=list.filter(p=>p.kind===opts.kind);return list.sort((a,b)=>b.date.localeCompare(a.date));}
export function createPurchase(input: { date?: string; supplierId?: UUID | null; description: string; amount: number; paymentMethod: PaymentMethod; paidAmount?: number; kind: "general" | "order_specific"; orderId?: UUID | null; notes?: string | null }): { purchase: Purchase | null; errors: string[] } {
  assertPermission("purchases.manage");
  const errors: string[] = [];
  if (!input.description.trim()) errors.push("Description required");
  if (![input.amount, input.paidAmount ?? 0].every(n => Number.isFinite(n) && n >= 0 && Number.isSafeInteger(Math.round(n * 100))) || r2(input.amount) <= 0) errors.push("Invalid purchase amount");
  if (!["general", "order_specific"].includes(input.kind)) errors.push("Invalid purchase kind");
  if (input.kind === "order_specific" && !input.orderId) errors.push("Order is required for order-specific purchase");
  const supplier = input.supplierId ? getSupplier(input.supplierId) : undefined;
  if (input.supplierId && !supplier) errors.push("Supplier not found");
  if (errors.length) return { purchase: null, errors };
  const bal = purchaseBalance(input.amount, input.paidAmount ?? 0);
  if (bal.balanceAmount > 0 && !supplier) return { purchase: null, errors: ["Supplier is required for unpaid purchases"] };
  if (supplier && (!Number.isFinite(supplier.outstandingBalance) || !Number.isSafeInteger(Math.round((supplier.outstandingBalance + bal.balanceAmount) * 100)))) return { purchase: null, errors: ["Supplier balance needs reconciliation"] };
  let orderNumber: string | null = null;
  if (input.orderId) {
    assertPermission("orders.manage");
    const order = ordersStore.getOrder(input.orderId);
    if (!order) return { purchase: null, errors: ["Order not found"] };
    orderNumber = order.orderNumber;
  }
  const purchaseNumber = nextDocNumber(lastPurchaseNo, "PUR");
  const purchase: Purchase = { id: generateId(), purchaseNumber, date: input.date || nowISO(), supplierId: input.supplierId ?? null,
    supplierName: supplier?.name ?? null, description: input.description, amount: bal.amount, paymentMethod: input.paymentMethod,
    paidAmount: bal.paidAmount, balanceAmount: bal.balanceAmount, kind: input.kind, orderId: input.orderId ?? null, orderNumber,
    notes: input.notes ?? null, createdAt: nowISO(), updatedAt: nowISO(), version: 1 };
  const posting = planDirectPurchasePosting(purchase);
  if (posting.errors.length) return { purchase: null, errors: posting.errors };
  if (input.orderId) ordersStore.addOrderExpense(input.orderId, input.description || "Order purchase", bal.amount);
  lastPurchaseNo = purchaseNumber;
  if (supplier && bal.balanceAmount > 0) { supplier.outstandingBalance = r2(supplier.outstandingBalance + bal.balanceAmount); supplier.updatedAt = nowISO(); }
  purchases.push(purchase);
  posting.commit();
  touchPersistence();
  void remoteCreatePurchase(purchase, supplier);
  return { purchase, errors: [] };
}

function r2(n:number){return Math.round((n+Number.EPSILON)*100)/100;}

function laundryAllocationFromPayment(notes: string, orderNumber: string): number | null {
  const segment = notes.split(" · ").find((part) => part.startsWith("Laundry: "));
  if (!segment) return 0;
  const entries = segment.slice("Laundry: ".length).split(", ").filter(Boolean);
  let total = 0;
  for (const entry of entries) {
    const splitAt = entry.lastIndexOf(" ");
    if (splitAt <= 0) return null;
    const label = entry.slice(0, splitAt);
    const rawAmount = entry.slice(splitAt + 1);
    if (!/^\d+\.\d{2}$/.test(rawAmount)) return null;
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100))) return null;
    if (label === orderNumber) total = r2(total + amount);
  }
  return total;
}

mainStore.registerCustomerReceivableProvider("laundry", {
  list(customerId) {
    return laundryOrders
      .filter((order) => !order.deletedAt && order.customerId === customerId && order.status !== "cancelled" && order.balanceAmount > 0)
      .map((order) => ({
        id: order.id,
        label: order.orderNumber,
        date: order.createdAt,
        balance: order.balanceAmount,
        postedReceivable: hasLaundryPosting(order.id),
        sourceType: "laundry" as const,
      }));
  },
  validate(allocations) {
    for (const { item, amount } of allocations) {
      const order = laundryOrders.find((candidate) => candidate.id === item.id && !candidate.deletedAt);
      if (!order || order.status === "cancelled") return "Laundry collection target is no longer available";
      if (![order.totalCustomerCharge, order.paidAmount, order.balanceAmount, amount].every(Number.isFinite)
        || order.paidAmount < 0 || order.balanceAmount <= 0 || amount <= 0 || amount > order.balanceAmount
        || r2(order.paidAmount + order.balanceAmount) !== r2(order.totalCustomerCharge)
        || !Number.isSafeInteger(Math.round((order.paidAmount + amount) * 100))
        || !Number.isSafeInteger(Math.round((order.balanceAmount - amount) * 100))) {
        return "Laundry balances need reconciliation";
      }
    }
    return null;
  },
  apply(allocations, now) {
    for (const { item, amount } of allocations) {
      const order = laundryOrders.find((candidate) => candidate.id === item.id && !candidate.deletedAt);
      if (!order || order.status === "cancelled") throw new Error("Laundry collection target is no longer available");
      if (![order.totalCustomerCharge, order.paidAmount, order.balanceAmount, amount].every(Number.isFinite)
        || order.paidAmount < 0 || order.balanceAmount <= 0 || amount <= 0 || amount > order.balanceAmount
        || r2(order.paidAmount + order.balanceAmount) !== r2(order.totalCustomerCharge)
        || !Number.isSafeInteger(Math.round((order.paidAmount + amount) * 100))
        || !Number.isSafeInteger(Math.round((order.balanceAmount - amount) * 100))) {
        throw new Error("Laundry balances need reconciliation");
      }
      const before = { paidAmount: order.paidAmount, balanceAmount: order.balanceAmount, version: order.version };
      order.paidAmount = r2(order.paidAmount + amount);
      order.balanceAmount = r2(order.balanceAmount - amount);
      order.updatedAt = now;
      order.version += 1;
      enqueueOutbox("laundry_orders", order.id, "update", { ...order });
      auditAction("laundry.collection", "laundry_orders", order.id, before, {
        paidAmount: order.paidAmount,
        balanceAmount: order.balanceAmount,
        amount,
      });
    }
    touchPersistence();
  },
});

export function hydratePhase5(data:{suppliers?:Supplier[];laundryOrders?:LaundryOrder[];expenses?:Expense[];purchases?:Purchase[];expenseCategories?:ExpenseCategory[]}){if(data.suppliers){suppliers.length=0;suppliers.push(...data.suppliers);}if(data.laundryOrders){laundryOrders.length=0;laundryOrders.push(...data.laundryOrders);}if(data.expenses){expenses.length=0;expenses.push(...data.expenses);}if(data.purchases){purchases.length=0;purchases.push(...data.purchases);}if(data.expenseCategories){expenseCategories.length=0;expenseCategories.push(...data.expenseCategories);}lastLaundryNo=maxDocumentNumber(laundryOrders.map(x=>x.orderNumber),"LDY");lastPurchaseNo=maxDocumentNumber(purchases.map(x=>x.purchaseNumber),"PUR");}
function maxDocumentNumber(values:string[],prefix:string){let max=0;for(const value of values){const match=new RegExp(`^${prefix}-(\\d+)$`).exec(value||"");if(match)max=Math.max(max,Number(match[1]));}return max>0?`${prefix}-${String(max).padStart(4,"0")}`:null;}
