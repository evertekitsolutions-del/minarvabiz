import { planDirectPurchasePosting, planSupplierPaymentPosting, supplierOpeningPayableBalance } from "./procurement-accounting";
import { assertPermission } from "./permissions";
import { enqueueOutbox } from "./outbox-bridge";
import { remoteCreateSupplier, remoteUpsertSupplier, remoteCreateLaundry, remoteCreatePurchase, remoteSupplierSettlement, remoteUpsertCustomer } from "./remote-write";
import type { Supplier, LaundryOrder, Expense, ExpenseCategory, Purchase, PaymentMethod, UUID } from "@minarvabiz/types";
import {
  addMinorUnits,
  formatMinorUnits,
  fromMinorUnits,
  generateId,
  nowISO,
  subtractMinorUnits,
  toMinorUnits,
  toQuantityMilli,
} from "@minarvabiz/utils";
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
const SYSTEM_EXPENSE_CATEGORY_NAME_BY_ID: Record<string, string> = {
  "ec-3": "Rental",
  "ec-4": "Water",
  "ec-6": "Shop Purchases",
};

function normalizeSystemExpenseCategoryName(id: string, name: string): string {
  return SYSTEM_EXPENSE_CATEGORY_NAME_BY_ID[id] ?? name;
}

const expenseCategories: ExpenseCategory[] = [
  { id: "ec-1", name: "Salary", isSystem: true, createdAt: nowISO() }, { id: "ec-2", name: "Electricity", isSystem: true, createdAt: nowISO() },
  { id: "ec-3", name: "Rental", isSystem: true, createdAt: nowISO() }, { id: "ec-4", name: "Water", isSystem: true, createdAt: nowISO() },
  { id: "ec-5", name: "Drinking Water", isSystem: true, createdAt: nowISO() }, { id: "ec-6", name: "Shop Purchases", isSystem: true, createdAt: nowISO() },
  { id: "ec-7", name: "Transportation", isSystem: true, createdAt: nowISO() }, { id: "ec-8", name: "Maintenance", isSystem: true, createdAt: nowISO() },
  { id: "ec-9", name: "Other", isSystem: true, createdAt: nowISO() },
];
const laundryOrders: LaundryOrder[] = [];
const expenses: Expense[] = [];
const purchases: Purchase[] = [];
let lastLaundryNo: string | null = null;
let lastPurchaseNo: string | null = null;

function moneyMinorOrNull(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  try { return toMinorUnits(value); } catch { return null; }
}

function quantityMilliOrNull(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  try { return toQuantityMilli(value); } catch { return null; }
}

function addMinorOrNull(...values: number[]): number | null {
  try { return addMinorUnits(...values); } catch { return null; }
}

function subtractMinorOrNull(a: number, b: number): number | null {
  try { return subtractMinorUnits(a, b); } catch { return null; }
}

export function listSuppliers(query?: string): Supplier[] { let list = suppliers.filter((s) => !s.deletedAt); if (query?.trim()) { const q = query.toLowerCase(); list = list.filter((s) => s.name.toLowerCase().includes(q) || s.company?.toLowerCase().includes(q) || s.phone?.includes(q)); } return list.sort((a,b)=>a.name.localeCompare(b.name)); }
export function getSupplier(id: UUID): Supplier | undefined { return suppliers.find((s) => s.id === id && !s.deletedAt); }
export function createSupplier(input: { name: string; company?: string | null; phone?: string | null; email?: string | null; address?: string | null; category?: string | null; notes?: string | null; openingBalance?: number; }): Supplier {
  assertPermission("purchases.manage");
  const rawOpeningBalance = input.openingBalance ?? 0;
  const openingMinor = moneyMinorOrNull(rawOpeningBalance);
  if (openingMinor == null || openingMinor < 0) {
    throw new Error("Opening supplier balance must be a finite non-negative amount");
  }
  const openingBalance = fromMinorUnits(openingMinor);
  const id = generateId();
  const posting = openingMinor > 0
    ? planAutomaticPosting({
        referenceType: "auto_opening_supplier",
        referenceId: "opening-supplier-" + id + "-create",
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
  const inputMinor = moneyMinorOrNull(input.amount);
  if (!supplier) errors.push("Supplier not found");
  if (inputMinor == null || inputMinor <= 0) errors.push("Amount must be positive and finite");
  if (!["cash", "bank", "card", "upi", "online", "other"].includes(input.paymentMethod)) errors.push("Invalid payment method");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(date)) || new Date(day).toISOString().slice(0, 10) !== day) errors.push("Invalid payment date");

  const supplierOutstandingMinor = supplier ? moneyMinorOrNull(supplier.outstandingBalance) : null;
  if (supplier && (supplierOutstandingMinor == null || supplierOutstandingMinor <= 0)) errors.push("Supplier has no valid outstanding balance");
  if (errors.length || !supplier || inputMinor == null || supplierOutstandingMinor == null) {
    return { payment: null, supplier: null, errors };
  }

  const invoices = listPurchaseInvoices(supplier.id).filter((invoice) => {
    const balanceMinor = moneyMinorOrNull(invoice.balanceAmount);
    return ["posted", "partially_paid"].includes(invoice.status) && balanceMinor != null && balanceMinor > 0;
  });
  const selected = input.purchaseInvoiceId ? invoices.find((invoice) => invoice.id === input.purchaseInvoiceId) : undefined;
  if (input.purchaseInvoiceId && !selected) return { payment: null, supplier: null, errors: ["Selected supplier invoice is not payable"] };

  const allCandidates = [
    ...invoices.map((invoice) => ({
      id: invoice.id,
      type: "invoice" as const,
      date: invoice.invoiceDate,
      number: invoice.invoiceNumber,
      total: invoice.total,
      paid: invoice.paidAmount,
      balance: invoice.balanceAmount,
    })),
    ...purchases
      .filter((purchase) => {
        const balanceMinor = moneyMinorOrNull(purchase.balanceAmount);
        return !purchase.deletedAt && purchase.supplierId === supplier.id && balanceMinor != null && balanceMinor > 0;
      })
      .map((purchase) => ({
        id: purchase.id,
        type: "purchase" as const,
        date: purchase.date,
        number: purchase.purchaseNumber,
        total: purchase.amount,
        paid: purchase.paidAmount,
        balance: purchase.balanceAmount,
      })),
  ];

  const candidates = allCandidates
    .filter((candidate) => !selected || (candidate.type === "invoice" && candidate.id === selected.id))
    .sort((a, b) => a.date.slice(0, 10).localeCompare(b.date.slice(0, 10)) || a.id.localeCompare(b.id));

  const selectedBalanceMinor = selected ? moneyMinorOrNull(selected.balanceAmount) : null;
  const appliedMinor = Math.min(inputMinor, supplierOutstandingMinor, selectedBalanceMinor ?? Number.MAX_SAFE_INTEGER);
  let remainingMinor = appliedMinor;
  const allocations: Array<{ id: UUID; type: "invoice" | "purchase"; amount: number; number: string }> = [];

  for (const candidate of candidates) {
    if (remainingMinor <= 0) break;
    const totalMinor = moneyMinorOrNull(candidate.total);
    const paidMinor = moneyMinorOrNull(candidate.paid);
    const balanceMinor = moneyMinorOrNull(candidate.balance);
    const reconciledMinor = paidMinor != null && balanceMinor != null ? addMinorOrNull(paidMinor, balanceMinor) : null;
    if (totalMinor == null || paidMinor == null || balanceMinor == null
      || totalMinor < 0 || paidMinor < 0 || balanceMinor < 0 || reconciledMinor !== totalMinor) {
      return { payment: null, supplier: null, errors: ["Document balances need reconciliation: " + candidate.number] };
    }
    const allocationMinor = Math.min(balanceMinor, remainingMinor);
    allocations.push({ ...candidate, amount: fromMinorUnits(allocationMinor) });
    remainingMinor = subtractMinorUnits(remainingMinor, allocationMinor);
  }

  const invoicePlan = prepareSupplierInvoiceSettlements(supplier.id, allocations.filter((allocation) => allocation.type === "invoice"));
  if (invoicePlan.errors.length) return { payment: null, supplier: null, errors: invoicePlan.errors };

  let openingAppliedMinor = 0;
  if (remainingMinor > 0) {
    const documentMinors = allCandidates.map((candidate) => moneyMinorOrNull(candidate.balance));
    if (documentMinors.some((minor) => minor == null || minor! < 0)) {
      return { payment: null, supplier: null, errors: ["Supplier document balances need reconciliation"] };
    }
    const documentOutstandingMinor = addMinorOrNull(...(documentMinors as number[]));
    if (documentOutstandingMinor == null) return { payment: null, supplier: null, errors: ["Supplier document balances are out of range"] };
    const otherOutstandingMinor = Math.max(0, subtractMinorUnits(supplierOutstandingMinor, documentOutstandingMinor));
    const openingBalanceMinor = moneyMinorOrNull(supplierOpeningPayableBalance(supplier.id));
    if (openingBalanceMinor == null || openingBalanceMinor < 0) {
      return { payment: null, supplier: null, errors: ["Supplier opening balance needs reconciliation"] };
    }
    const postedOpeningOutstandingMinor = Math.min(otherOutstandingMinor, openingBalanceMinor);
    const legacyOutstandingMinor = Math.max(0, subtractMinorUnits(otherOutstandingMinor, postedOpeningOutstandingMinor));
    const legacyAppliedMinor = Math.min(remainingMinor, legacyOutstandingMinor);
    openingAppliedMinor = Math.max(0, subtractMinorUnits(remainingMinor, legacyAppliedMinor));
  }

  const allocationNotes = allocations.length
    ? "Documents: " + allocations.map((allocation) => `${allocation.number} ${formatMinorUnits(toMinorUnits(allocation.amount))}`).join(", ")
    : null;
  const paymentId = generateId();
  const applied = fromMinorUnits(appliedMinor);
  const openingApplied = fromMinorUnits(openingAppliedMinor);
  const posting = planSupplierPaymentPosting({
    id: paymentId,
    amount: applied,
    method: input.paymentMethod,
    date,
    allocations,
    openingAmount: openingApplied,
  });
  if (posting.errors.length) return { payment: null, supplier: null, errors: posting.errors };

  const payment = mainStore.recordSupplierPaymentEntry({
    supplierId: supplier.id,
    amount: applied,
    method: input.paymentMethod,
    paidAt: date,
    reference: input.reference,
    notes: [
      input.notes,
      allocationNotes,
      remainingMinor > 0 ? `Other supplier balance: ${formatMinorUnits(remainingMinor)}` : null,
    ].filter(Boolean).join(" · "),
    deferRemote: true,
    paymentId,
  });

  supplier.outstandingBalance = fromMinorUnits(Math.max(0, subtractMinorUnits(supplierOutstandingMinor, appliedMinor)));
  supplier.updatedAt = nowISO();

  const settledInvoices = invoicePlan.commit();
  const settledPurchases: Purchase[] = [];
  for (const allocation of allocations.filter((item) => item.type === "purchase")) {
    const purchase = purchases.find((item) => item.id === allocation.id)!;
    const before = { ...purchase };
    const amountMinor = toMinorUnits(allocation.amount);
    const purchasePaidMinor = toMinorUnits(purchase.paidAmount);
    const purchaseTotalMinor = toMinorUnits(purchase.amount);
    const nextPaidMinor = addMinorUnits(purchasePaidMinor, amountMinor);
    purchase.paidAmount = fromMinorUnits(nextPaidMinor);
    purchase.balanceAmount = fromMinorUnits(Math.max(0, subtractMinorUnits(purchaseTotalMinor, nextPaidMinor)));
    purchase.updatedAt = nowISO();
    purchase.version = (purchase.version || 1) + 1;
    settledPurchases.push({ ...purchase });
    auditAction("purchase.payment", "purchases", purchase.id, before, purchase);
  }

  posting.commit();
  void remoteSupplierSettlement({ ...payment }, { ...supplier }, settledInvoices, settledPurchases);
  auditAction("supplier.payment.allocate", "suppliers", supplier.id, null, {
    paymentId: payment.id,
    allocations,
    otherBalanceAmount: fromMinorUnits(remainingMinor),
  });
  touchPersistence();
  return { payment, supplier, errors: [] };
}

export function listLaundryOrders(opts?: { mode?: "outsourced"|"in_house_ironing"; status?: LaundryOrder["status"]; customerId?: UUID; supplierId?: UUID; dateFrom?: string; dateTo?: string; query?: string }): LaundryOrder[] { let list=laundryOrders.filter(o=>!o.deletedAt);if(opts?.mode)list=list.filter(o=>o.mode===opts.mode);if(opts?.status)list=list.filter(o=>o.status===opts.status);if(opts?.customerId)list=list.filter(o=>o.customerId===opts.customerId);if(opts?.supplierId)list=list.filter(o=>o.supplierId===opts.supplierId);if(opts?.dateFrom)list=list.filter(o=>o.createdAt.slice(0,10)>=opts.dateFrom!);if(opts?.dateTo)list=list.filter(o=>o.createdAt.slice(0,10)<=opts.dateTo!);if(opts?.query?.trim()){const q=opts.query.toLowerCase();list=list.filter(o=>o.orderNumber.toLowerCase().includes(q)||o.customerName?.toLowerCase().includes(q)||o.garment?.toLowerCase().includes(q)||o.supplierName?.toLowerCase().includes(q)||o.notes?.toLowerCase().includes(q));}return list.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)); }
export function createLaundryOrder(input: { customerId: UUID; garment?: string|null; quantity:number; mode:"outsourced"|"in_house_ironing"; supplierId?: UUID|null; supplierRate:number; customerRate:number; notes?:string|null; paidAmount?:number; paymentMethod?:PaymentMethod }): {order:LaundryOrder|null;errors:string[]} {
  assertPermission("orders.manage");
  const errors:string[]=[];
  const quantity=Number(input.quantity);
  const customerRateInput=Number(input.customerRate);
  const supplierRateInput=Number(input.supplierRate);
  const paidInput=Number(input.paidAmount??0);
  const quantityMilli=quantityMilliOrNull(quantity);
  const customerRateMinor=moneyMinorOrNull(customerRateInput);
  const rawSupplierRateMinor=moneyMinorOrNull(supplierRateInput);
  const paidInputMinor=moneyMinorOrNull(paidInput);

  if(!input.customerId) errors.push("Customer is required");
  if(!["outsourced","in_house_ironing"].includes(input.mode)) errors.push("Invalid laundry mode");
  if(quantityMilli==null||quantityMilli<=0) errors.push("Quantity must be positive and finite");
  if(customerRateMinor==null||customerRateMinor<0) errors.push("Customer rate must be a finite non-negative amount");
  if(rawSupplierRateMinor==null||rawSupplierRateMinor<0) errors.push("Supplier rate must be a finite non-negative amount");
  if(paidInputMinor==null||paidInputMinor<0) errors.push("Paid amount must be a finite non-negative amount");
  if(input.mode==="outsourced"&&!input.supplierId) errors.push("Supplier is required for outsourced laundry");
  const paymentMethod=(input.paymentMethod??"cash") as PaymentMethod;
  if(!["cash","bank","card","upi","online","other"].includes(paymentMethod)) errors.push("Invalid payment method");
  if(errors.length || quantityMilli==null || customerRateMinor==null || rawSupplierRateMinor==null || paidInputMinor==null) return {order:null,errors};

  const customer=mainStore.getCustomer(input.customerId);
  if(!customer) return {order:null,errors:["Customer not found"]};
  const supplierRateMinor=input.mode==="in_house_ironing"?0:rawSupplierRateMinor;
  const customerRate=fromMinorUnits(customerRateMinor);
  const supplierRate=fromMinorUnits(supplierRateMinor);
  const calc=calculateLaundryProfit({customerRate,supplierRate,quantity});
  const totalCustomerMinor=moneyMinorOrNull(calc.totalCustomerCharge);
  const totalSupplierMinor=moneyMinorOrNull(calc.totalSupplierCost);
  const totalProfitMinor=moneyMinorOrNull(calc.totalProfit);
  if(totalCustomerMinor==null||totalSupplierMinor==null||totalProfitMinor==null) {
    return {order:null,errors:["Laundry totals are out of range"]};
  }

  const supplier=input.mode==="outsourced"&&input.supplierId?getSupplier(input.supplierId):undefined;
  if(input.mode==="outsourced"&&!supplier) return {order:null,errors:["Supplier not found"]};

  const paidMinor=Math.min(paidInputMinor,totalCustomerMinor);
  const balanceMinor=subtractMinorUnits(totalCustomerMinor,paidMinor);
  const customerOutstandingMinor=moneyMinorOrNull(customer.outstandingBalance);
  const customerSpendingMinor=moneyMinorOrNull(customer.totalSpending);
  const nextCustomerOutstandingMinor=customerOutstandingMinor==null?null:addMinorOrNull(customerOutstandingMinor,balanceMinor);
  const nextCustomerSpendingMinor=customerSpendingMinor==null?null:addMinorOrNull(customerSpendingMinor,paidMinor);
  if(customerOutstandingMinor==null||customerOutstandingMinor<0||customerSpendingMinor==null||customerSpendingMinor<0
    ||nextCustomerOutstandingMinor==null||nextCustomerSpendingMinor==null) {
    return {order:null,errors:["Customer balance needs reconciliation"]};
  }

  const supplierOutstandingMinor=supplier?moneyMinorOrNull(supplier.outstandingBalance):0;
  const nextSupplierOutstandingMinor=supplier&&supplierOutstandingMinor!=null
    ?addMinorOrNull(supplierOutstandingMinor,totalSupplierMinor)
    :supplierOutstandingMinor;
  if(supplier&&(supplierOutstandingMinor==null||supplierOutstandingMinor<0||nextSupplierOutstandingMinor==null)) {
    return {order:null,errors:["Supplier balance needs reconciliation"]};
  }

  const paid=fromMinorUnits(paidMinor);
  const balance=fromMinorUnits(balanceMinor);
  const orderNumber=nextDocNumber(lastLaundryNo,"LDY");
  const now=nowISO();
  const order:LaundryOrder={
    id:generateId(),orderNumber,customerId:input.customerId,customerName:customer.name,
    garment:input.garment??null,quantity,mode:input.mode,supplierId:input.mode==="outsourced"?(input.supplierId??null):null,
    supplierName:supplier?.name??null,supplierRate,customerRate,profit:fromMinorUnits(totalProfitMinor),
    totalCustomerCharge:fromMinorUnits(totalCustomerMinor),totalSupplierCost:fromMinorUnits(totalSupplierMinor),
    status:input.mode==="in_house_ironing"?"delivered":"pending",notes:input.notes??null,
    paidAmount:paid,balanceAmount:balance,createdAt:now,updatedAt:now,version:1
  };
  const accountingPlan=planLaundryPosting(order,paymentMethod);
  if(accountingPlan.errors.length) return {order:null,errors:accountingPlan.errors};

  lastLaundryNo=orderNumber;
  customer.outstandingBalance=fromMinorUnits(nextCustomerOutstandingMinor);
  customer.totalSpending=fromMinorUnits(nextCustomerSpendingMinor);
  customer.updatedAt=now;
  if(supplier&&nextSupplierOutstandingMinor!=null){
    supplier.outstandingBalance=fromMinorUnits(nextSupplierOutstandingMinor);
    supplier.updatedAt=now;
  }
  laundryOrders.push(order);
  accountingPlan.commit();
  if (paidMinor > 0) {
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

export function updateLaundryDetails(id: UUID, input: { garment?: string | null; notes?: string | null }): { order: LaundryOrder | null; errors: string[] } {
  assertPermission("orders.manage");
  const order = laundryOrders.find((item) => item.id === id && !item.deletedAt);
  if (!order) return { order: null, errors: ["Laundry order not found"] };
  if (order.status === "cancelled") return { order: null, errors: ["Cancelled laundry tickets are immutable"] };
  const before = { garment: order.garment ?? null, notes: order.notes ?? null, updatedAt: order.updatedAt, version: order.version };
  order.garment = input.garment?.trim() || null;
  order.notes = input.notes?.trim() || null;
  order.updatedAt = nowISO();
  order.version += 1;
  enqueueOutbox("laundry_orders", order.id, "update", { ...order });
  auditAction("laundry.update_details", "laundry_orders", order.id, before, {
    garment: order.garment ?? null,
    notes: order.notes ?? null,
    version: order.version,
  });
  touchPersistence();
  return { order: { ...order }, errors: [] };
}

export function cancelLaundryOrder(input: {
  orderId: UUID;
  reason: string;
  refundPaymentMethod?: PaymentMethod;
  supplierCostAction?: "keep" | "reverse";
}): { order: LaundryOrder | null; errors: string[] } {
  assertPermission("orders.manage");
  const order = laundryOrders.find((item) => item.id === input.orderId && !item.deletedAt);
  if (!order) return { order: null, errors: ["Laundry order not found"] };
  const cancellationReason = input.reason.trim();
  if (cancellationReason.length < 3) return { order: null, errors: ["Cancellation reason is required"] };
  if (order.status === "cancelled") return { order: null, errors: ["Laundry order is already cancelled"] };

  const customer = mainStore.getCustomer(order.customerId);
  const customerOutstandingMinor = customer ? moneyMinorOrNull(customer.outstandingBalance) : null;
  const customerSpendingMinor = customer ? moneyMinorOrNull(customer.totalSpending) : null;
  const orderBalanceMinor = moneyMinorOrNull(order.balanceAmount);
  const orderPaidMinor = moneyMinorOrNull(order.paidAmount);
  if (!customer || customerOutstandingMinor == null || customerSpendingMinor == null
    || orderBalanceMinor == null || orderPaidMinor == null
    || customerOutstandingMinor < orderBalanceMinor || customerSpendingMinor < orderPaidMinor) {
    return { order: null, errors: ["Customer balance needs reconciliation before laundry cancellation"] };
  }

  const sourcePayments = mainStore.listPayments().filter((payment) =>
    payment.referenceType === "laundry"
    && payment.referenceId === order.id
    && payment.customerId === order.customerId
  );
  const sourcePaymentMinors: number[] = [];
  for (const payment of sourcePayments) {
    const amountMinor = moneyMinorOrNull(payment.amount);
    if (amountMinor == null || amountMinor <= 0
      || !["cash", "bank", "card", "upi", "online", "other"].includes(payment.method)) {
      return { order: null, errors: ["Laundry receipt source needs reconciliation before cancellation"] };
    }
    sourcePaymentMinors.push(amountMinor);
  }
  if (sourcePayments.length > 1) {
    return { order: null, errors: ["Laundry receipt source needs reconciliation before cancellation"] };
  }

  const initialReceiptMinor = addMinorOrNull(...sourcePaymentMinors);
  if (initialReceiptMinor == null) return { order: null, errors: ["Laundry receipt source needs reconciliation before cancellation"] };

  let allocatedCollectionMinor = 0;
  for (const payment of mainStore.listPayments()) {
    if (payment.customerId !== order.customerId || payment.referenceType !== "other" || payment.paidAt < order.createdAt) continue;
    const allocationMinor = laundryAllocationMinorFromPayment(payment.notes ?? "", order.orderNumber);
    if (allocationMinor == null) return { order: null, errors: ["Laundry collection source needs reconciliation before cancellation"] };
    const nextAllocated = addMinorOrNull(allocatedCollectionMinor, allocationMinor);
    if (nextAllocated == null) return { order: null, errors: ["Laundry collection source needs reconciliation before cancellation"] };
    allocatedCollectionMinor = nextAllocated;
  }
  if (addMinorUnits(initialReceiptMinor, allocatedCollectionMinor) !== orderPaidMinor) {
    return { order: null, errors: ["Laundry receipt and collection sources need reconciliation before cancellation"] };
  }
  if (orderPaidMinor > 0 && !input.refundPaymentMethod) {
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
  let supplierOutstandingMinor: number | null = null;
  const supplierCostMinor = moneyMinorOrNull(order.totalSupplierCost);
  if (supplierCostMinor == null) return { order: null, errors: ["Laundry supplier source needs reconciliation"] };
  if (supplierCostMinor > 0) {
    if (!["keep", "reverse"].includes(input.supplierCostAction ?? "")) {
      return { order: null, errors: ["Select how to handle the laundry supplier cost"] };
    }
    if (input.supplierCostAction === "reverse") {
      if (!order.supplierId) return { order: null, errors: ["Laundry supplier source needs reconciliation"] };
      supplier = getSupplier(order.supplierId);
      supplierOutstandingMinor = supplier ? moneyMinorOrNull(supplier.outstandingBalance) : null;
      if (!supplier || supplierOutstandingMinor == null || supplierOutstandingMinor < supplierCostMinor) {
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

  customer.outstandingBalance = fromMinorUnits(subtractMinorUnits(customerOutstandingMinor, orderBalanceMinor));
  customer.totalSpending = fromMinorUnits(subtractMinorUnits(customerSpendingMinor, orderPaidMinor));
  customer.updatedAt = now;

  if (supplier && input.supplierCostAction === "reverse" && supplierOutstandingMinor != null) {
    supplier.outstandingBalance = fromMinorUnits(subtractMinorUnits(supplierOutstandingMinor, supplierCostMinor));
    supplier.updatedAt = now;
  }

  order.status = "cancelled";
  order.updatedAt = now;
  order.version += 1;
  reversal.commit();

  const refundPayment = orderPaidMinor > 0 && input.refundPaymentMethod
    ? mainStore.recordLaundryRefundPaymentEntry({
        laundryOrderId: order.id,
        customerId: order.customerId,
        amount: fromMinorUnits(orderPaidMinor),
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
    cancellationReason,
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
  const amountMinor = moneyMinorOrNull(input.amount);
  if (amountMinor == null || amountMinor <= 0) errors.push("Amount must be positive and finite");
  const cat = expenseCategories.find((category) => category.id === input.categoryId);
  if (!cat) errors.push("Category required");
  if (errors.length || amountMinor == null) return { expense: null, errors };
  let orderNumber: string | null = null;
  if (input.orderId) {
    assertPermission("orders.manage");
    const order = ordersStore.getOrder(input.orderId);
    if (!order) return { expense: null, errors: ["Order not found"] };
    orderNumber = order.orderNumber;
  }
  const expense: Expense = { id: generateId(), date: input.date || nowISO(), categoryId: input.categoryId, categoryName: cat!.name,
    amount: fromMinorUnits(amountMinor), paymentMethod: input.paymentMethod, description: input.description ?? null, reference: input.reference ?? null,
    receiptUrl: input.receiptUrl ?? null, staffId: input.staffId ?? null, orderId: input.orderId ?? null, orderNumber,
    createdAt: nowISO(), updatedAt: nowISO(), version: 1 };
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

export function reverseExpense(id: UUID, reason: string): { expense: Expense | null; errors: string[] } {
  assertPermission("expenses.manage");
  const expense = expenses.find((item) => item.id === id);
  if (!expense || expense.deletedAt) return { expense: null, errors: ["Expense not found"] };
  const reversalReason = reason.trim();
  if (reversalReason.length < 3) return { expense: null, errors: ["Reversal reason is required"] };
  const expenseMinor = moneyMinorOrNull(expense.amount);
  if (expenseMinor == null || expenseMinor <= 0) {
    return { expense: null, errors: ["Expense amount needs reconciliation"] };
  }
  if (expense.orderId) {
    assertPermission("orders.manage");
    const order = ordersStore.getOrder(expense.orderId);
    const linked = order?.expenses.find((item) => item.id === expense.id);
    const linkedMinor = linked ? moneyMinorOrNull(linked.amount) : null;
    if (!order || !linked || linkedMinor == null || linkedMinor !== expenseMinor) {
      return { expense: null, errors: ["Order-linked expense needs source reconciliation before reversal"] };
    }
  }
  const reversal = planExpenseReversal(expense);
  if (reversal.errors.length) return { expense: null, errors: reversal.errors };

  const before = { ...expense };
  if (expense.orderId) {
    const rolledBack = ordersStore.removeOrderExpense(expense.orderId, expense.id, fromMinorUnits(expenseMinor));
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
    reversalReason,
  });
  touchPersistence();
  return { expense: { ...expense }, errors: [] };
}

export function listPurchases(opts?:{kind?:"general"|"order_specific"}):Purchase[]{let list=purchases.filter(p=>!p.deletedAt);if(opts?.kind)list=list.filter(p=>p.kind===opts.kind);return list.sort((a,b)=>b.date.localeCompare(a.date));}
export function createPurchase(input: { date?: string; supplierId?: UUID | null; description: string; amount: number; paymentMethod: PaymentMethod; paidAmount?: number; kind: "general" | "order_specific"; orderId?: UUID | null; notes?: string | null }): { purchase: Purchase | null; errors: string[] } {
  assertPermission("purchases.manage");
  const errors: string[] = [];
  const amountMinor = moneyMinorOrNull(input.amount);
  const paidInputMinor = moneyMinorOrNull(input.paidAmount ?? 0);
  if (!input.description.trim()) errors.push("Description required");
  if (amountMinor == null || paidInputMinor == null || amountMinor <= 0 || paidInputMinor < 0) errors.push("Invalid purchase amount");
  if (!["general", "order_specific"].includes(input.kind)) errors.push("Invalid purchase kind");
  if (input.kind === "order_specific" && !input.orderId) errors.push("Order is required for order-specific purchase");
  const supplier = input.supplierId ? getSupplier(input.supplierId) : undefined;
  if (input.supplierId && !supplier) errors.push("Supplier not found");
  if (errors.length || amountMinor == null || paidInputMinor == null) return { purchase: null, errors };

  const bal = purchaseBalance(fromMinorUnits(amountMinor), fromMinorUnits(paidInputMinor));
  const balanceMinor = toMinorUnits(bal.balanceAmount);
  if (balanceMinor > 0 && !supplier) return { purchase: null, errors: ["Supplier is required for unpaid purchases"] };

  const supplierOutstandingMinor = supplier ? moneyMinorOrNull(supplier.outstandingBalance) : null;
  const nextSupplierOutstandingMinor = supplier && supplierOutstandingMinor != null
    ? addMinorOrNull(supplierOutstandingMinor, balanceMinor)
    : supplierOutstandingMinor;
  if (supplier && (supplierOutstandingMinor == null || supplierOutstandingMinor < 0 || nextSupplierOutstandingMinor == null)) {
    return { purchase: null, errors: ["Supplier balance needs reconciliation"] };
  }

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
  if (supplier && nextSupplierOutstandingMinor != null) {
    supplier.outstandingBalance = fromMinorUnits(nextSupplierOutstandingMinor);
    supplier.updatedAt = nowISO();
  }
  purchases.push(purchase);
  posting.commit();
  touchPersistence();
  void remoteCreatePurchase(purchase, supplier);
  return { purchase, errors: [] };
}

function laundryAllocationMinorFromPayment(notes: string, orderNumber: string): number | null {
  const segment = notes.split(" · ").find((part) => part.startsWith("Laundry: "));
  if (!segment) return 0;
  const entries = segment.slice("Laundry: ".length).split(", ").filter(Boolean);
  let totalMinor = 0;
  for (const entry of entries) {
    const splitAt = entry.lastIndexOf(" ");
    if (splitAt <= 0) return null;
    const label = entry.slice(0, splitAt);
    const rawAmount = entry.slice(splitAt + 1);
    const match = /^(\d+)\.(\d{2})$/.exec(rawAmount);
    if (!match) return null;
    try {
      const parsed = BigInt(match[1] || "0") * 100n + BigInt(match[2] || "0");
      if (parsed <= 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      if (label === orderNumber) {
        totalMinor = addMinorUnits(totalMinor, Number(parsed));
      }
    } catch {
      return null;
    }
  }
  return totalMinor;
}

mainStore.registerCustomerReceivableProvider("laundry", {
  list(customerId) {
    return laundryOrders
      .filter((order) => {
        const balanceMinor = moneyMinorOrNull(order.balanceAmount);
        return !order.deletedAt && order.customerId === customerId && order.status !== "cancelled" && balanceMinor != null && balanceMinor > 0;
      })
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
      const totalMinor = moneyMinorOrNull(order.totalCustomerCharge);
      const paidMinor = moneyMinorOrNull(order.paidAmount);
      const balanceMinor = moneyMinorOrNull(order.balanceAmount);
      const amountMinor = moneyMinorOrNull(amount);
      const reconciledMinor = paidMinor != null && balanceMinor != null ? addMinorOrNull(paidMinor, balanceMinor) : null;
      if (totalMinor == null || paidMinor == null || balanceMinor == null || amountMinor == null
        || paidMinor < 0 || balanceMinor <= 0 || amountMinor <= 0 || amountMinor > balanceMinor
        || reconciledMinor !== totalMinor) {
        return "Laundry balances need reconciliation";
      }
    }
    return null;
  },
  apply(allocations, now) {
    for (const { item, amount } of allocations) {
      const order = laundryOrders.find((candidate) => candidate.id === item.id && !candidate.deletedAt);
      if (!order || order.status === "cancelled") throw new Error("Laundry collection target is no longer available");
      const totalMinor = moneyMinorOrNull(order.totalCustomerCharge);
      const paidMinor = moneyMinorOrNull(order.paidAmount);
      const balanceMinor = moneyMinorOrNull(order.balanceAmount);
      const amountMinor = moneyMinorOrNull(amount);
      const reconciledMinor = paidMinor != null && balanceMinor != null ? addMinorOrNull(paidMinor, balanceMinor) : null;
      if (totalMinor == null || paidMinor == null || balanceMinor == null || amountMinor == null
        || paidMinor < 0 || balanceMinor <= 0 || amountMinor <= 0 || amountMinor > balanceMinor
        || reconciledMinor !== totalMinor) {
        throw new Error("Laundry balances need reconciliation");
      }
      const before = { paidAmount: order.paidAmount, balanceAmount: order.balanceAmount, version: order.version };
      order.paidAmount = fromMinorUnits(addMinorUnits(paidMinor, amountMinor));
      order.balanceAmount = fromMinorUnits(subtractMinorUnits(balanceMinor, amountMinor));
      order.updatedAt = now;
      order.version += 1;
      enqueueOutbox("laundry_orders", order.id, "update", { ...order });
      auditAction("laundry.collection", "laundry_orders", order.id, before, {
        paidAmount: order.paidAmount,
        balanceAmount: order.balanceAmount,
        amount: fromMinorUnits(amountMinor),
      });
    }
    touchPersistence();
  },
});

export function hydratePhase5(data:{suppliers?:Supplier[];laundryOrders?:LaundryOrder[];expenses?:Expense[];purchases?:Purchase[];expenseCategories?:ExpenseCategory[]}){
  if(data.suppliers){suppliers.length=0;suppliers.push(...data.suppliers);}
  if(data.laundryOrders){laundryOrders.length=0;laundryOrders.push(...data.laundryOrders);}
  if(data.expenses){
    expenses.length=0;
    expenses.push(...data.expenses.map((expense)=>{
      const categoryName=SYSTEM_EXPENSE_CATEGORY_NAME_BY_ID[expense.categoryId] ?? expense.categoryName;
      return categoryName===expense.categoryName?expense:{...expense,categoryName};
    }));
  }
  if(data.purchases){purchases.length=0;purchases.push(...data.purchases);}
  if(data.expenseCategories){
    expenseCategories.length=0;
    expenseCategories.push(...data.expenseCategories.map((category)=>{
      const name=normalizeSystemExpenseCategoryName(category.id,category.name);
      return name===category.name?category:{...category,name};
    }));
  }
  lastLaundryNo=maxDocumentNumber(laundryOrders.map(x=>x.orderNumber),"LDY");
  lastPurchaseNo=maxDocumentNumber(purchases.map(x=>x.purchaseNumber),"PUR");
}
function maxDocumentNumber(values:string[],prefix:string){let max=0;for(const value of values){const match=new RegExp(`^${prefix}-(\\d+)$`).exec(value||"");if(match)max=Math.max(max,Number(match[1]));}return max>0?`${prefix}-${String(max).padStart(4,"0")}`:null;}
