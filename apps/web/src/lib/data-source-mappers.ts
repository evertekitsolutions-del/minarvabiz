import type {
  AccountingAccount,
  Category,
  Expense,
  GoodsReceipt,
  GoodsReceiptLine,
  JournalEntry,
  JournalEntryLine,
  LaundryOrder,
  Payment,
  Purchase,
  PurchaseInvoice,
  PurchaseInvoiceLine,
  PurchaseOrder,
  PurchaseOrderLine,
  StaffMember,
  Supplier,
  Warehouse,
  WarehouseLocation,
  WarehouseStockPosition,
  WarehouseTransfer,
} from "@minarvabiz/types";

export function mapCategory(row: Record<string, unknown>): Category {
  return {
    id: String(row.id),
    name: String(row.name || ""),
    description: (row.description as string) ?? null,
    parentId: (row.parent_id as string) ?? null,
    isActive: row.is_active !== false,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    deletedAt: (row.deleted_at as string) ?? null,
    branchId: (row.branch_id as string) ?? null,
  };
}

export function mapSupplier(row: Record<string, unknown>): Supplier {
  return { id: String(row.id), name: String(row.name || ""), company: (row.company as string) ?? null, phone: (row.phone as string) ?? null,
    email: (row.email as string) ?? null, address: (row.address as string) ?? null, category: (row.category as string) ?? null,
    openingBalance: Number(row.opening_balance || 0), outstandingBalance: Number(row.outstanding_balance || 0), notes: (row.notes as string) ?? null,
    createdAt: String(row.created_at || new Date().toISOString()), updatedAt: String(row.updated_at || new Date().toISOString()),
    deletedAt: (row.deleted_at as string) ?? null, branchId: (row.branch_id as string) ?? null };
}

export function mapLaundry(row: Record<string, unknown>): LaundryOrder {
  const customerCharge = Number(row.total_customer_charge || 0);
  const supplierCost = Number(row.total_supplier_cost || 0);
  return { id: String(row.id), orderNumber: String(row.order_number || row.id), customerId: String(row.customer_id), customerName: (row.customer_name as string) ?? null,
    garment: (row.garment as string) ?? null, quantity: Number(row.quantity || 1), mode: row.mode === "in_house_ironing" ? "in_house_ironing" : "outsourced",
    supplierId: (row.supplier_id as string) ?? null, supplierName: (row.supplier_name as string) ?? null, supplierRate: Number(row.supplier_rate || 0),
    customerRate: Number(row.customer_rate || 0), profit: customerCharge - supplierCost, totalCustomerCharge: customerCharge, totalSupplierCost: supplierCost,
    status: (row.status as LaundryOrder["status"]) || "pending", notes: (row.notes as string) ?? null,
    paidAmount: Number(row.paid_amount || 0), balanceAmount: Number(row.balance_amount || Math.max(0, customerCharge - Number(row.paid_amount || 0))),
    createdAt: String(row.created_at || new Date().toISOString()), updatedAt: String(row.updated_at || new Date().toISOString()),
    deletedAt: (row.deleted_at as string) ?? null, branchId: (row.branch_id as string) ?? null, deviceId: (row.device_id as string) ?? null, version: Number(row.version || 1) };
}

export function mapExpense(row: Record<string, unknown>): Expense {
  return { id: String(row.id), date: String(row.date || new Date().toISOString()), categoryId: String(row.category_id), categoryName: null,
    amount: Number(row.amount || 0), paymentMethod: (row.payment_method as Expense["paymentMethod"]) || "other", description: (row.description as string) ?? null,
    reference: (row.notes as string) ?? null, orderId: (row.order_id as string) ?? null, orderNumber: null,
    createdAt: String(row.created_at || new Date().toISOString()), updatedAt: String(row.updated_at || new Date().toISOString()), deletedAt: (row.deleted_at as string) ?? null,
    branchId: (row.branch_id as string) ?? null, deviceId: (row.device_id as string) ?? null, version: Number(row.version || 1) };
}

export function mapPurchase(row: Record<string, unknown>): Purchase {
  return { id: String(row.id), purchaseNumber: String(row.doc_number || row.id), date: String(row.date || new Date().toISOString()),
    supplierId: (row.supplier_id as string) ?? null, supplierName: null, description: String(row.notes || "Purchase"), amount: Number(row.total || 0),
    paymentMethod: (row.payment_method as Purchase["paymentMethod"]) || "other", paidAmount: Number(row.paid || 0), balanceAmount: Number(row.balance || 0),
    kind: row.kind === "order_specific" ? "order_specific" : "general", orderId: (row.order_id as string) ?? null, orderNumber: null, notes: (row.notes as string) ?? null,
    createdAt: String(row.created_at || new Date().toISOString()), updatedAt: String(row.updated_at || new Date().toISOString()), deletedAt: (row.deleted_at as string) ?? null,
    branchId: (row.branch_id as string) ?? null, deviceId: (row.device_id as string) ?? null, version: Number(row.version || 1) };
}

export function mapStaff(row: Record<string, unknown>): StaffMember {
  return { id: String(row.id), name: String(row.name || ""), phone: (row.phone as string) ?? null, email: null,
    role: (row.role as StaffMember["role"]) || "staff", salary: Number(row.salary || 0), joiningDate: (row.joining_date as string) ?? null,
    status: (row.status as StaffMember["status"]) || "active", notes: null, createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()), deletedAt: (row.deleted_at as string) ?? null, branchId: (row.branch_id as string) ?? null };
}

export function mapPayment(row: Record<string, unknown>): Payment {
  return { id: String(row.id), amount: Number(row.amount || 0), method: (row.method as Payment["method"]) || "other",
    referenceType: (row.reference_type as Payment["referenceType"]) || "other", referenceId: String(row.reference_id), customerId: (row.customer_id as string) ?? null,
    notes: (row.notes as string) ?? null, paidAt: String(row.paid_at || new Date().toISOString()), createdAt: String(row.created_at || new Date().toISOString()),
    createdBy: (row.created_by as string) ?? null, branchId: (row.branch_id as string) ?? null, deviceId: (row.device_id as string) ?? null, version: Number(row.version || 1) };
}


export function mapWarehouse(row: Record<string, unknown>): Warehouse {
  return {
    id: String(row.id), name: String(row.name || ""), code: String(row.code || ""),
    branchId: (row.branch_id as string) ?? null, isDefault: row.is_default === true,
    isActive: row.is_active !== false, createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()), deletedAt: (row.deleted_at as string) ?? null,
    version: Number(row.version || 1),
  };
}

export function mapWarehouseLocation(row: Record<string, unknown>): WarehouseLocation {
  return {
    id: String(row.id), warehouseId: String(row.warehouse_id), code: String(row.code || ""),
    name: String(row.name || ""), type: (row.type as WarehouseLocation["type"]) || "storage",
    isActive: row.is_active !== false, createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()), deletedAt: (row.deleted_at as string) ?? null,
    version: Number(row.version || 1),
  };
}

export function mapWarehouseStock(row: Record<string, unknown>): WarehouseStockPosition {
  return {
    id: String(row.id), warehouseId: String(row.warehouse_id), locationId: String(row.location_id),
    productId: String(row.product_id), onHand: Number(row.on_hand || 0), reserved: Number(row.reserved || 0),
    updatedAt: String(row.updated_at || new Date().toISOString()), version: Number(row.version || 1),
  };
}

export function mapWarehouseTransfer(row: Record<string, unknown>): WarehouseTransfer {
  return {
    id: String(row.id), transferNumber: String(row.transfer_number || row.id), productId: String(row.product_id),
    sourceWarehouseId: String(row.source_warehouse_id), sourceLocationId: String(row.source_location_id),
    destinationWarehouseId: String(row.destination_warehouse_id), destinationLocationId: String(row.destination_location_id),
    quantity: Number(row.quantity || 0), status: (row.status as WarehouseTransfer["status"]) || "draft",
    notes: (row.notes as string) ?? null, createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()), approvedAt: (row.approved_at as string) ?? null,
    dispatchedAt: (row.dispatched_at as string) ?? null, receivedAt: (row.received_at as string) ?? null,
    cancelledAt: (row.cancelled_at as string) ?? null, createdBy: (row.created_by as string) ?? null,
    version: Number(row.version || 1),
  };
}

export function mapPurchaseOrderLine(row: Record<string, unknown>): PurchaseOrderLine {
  return {
    id: String(row.id),
    purchaseOrderId: String(row.purchase_order_id),
    productId: (row.product_id as string) ?? null,
    description: String(row.description || ""),
    orderedQuantity: Number(row.ordered_quantity || 0),
    receivedQuantity: Number(row.received_quantity || 0),
    unitCost: Number(row.unit_cost || 0),
    taxRate: Number(row.tax_rate || 0),
    lineSubtotal: Number(row.line_subtotal || 0),
    taxAmount: Number(row.tax_amount || 0),
    lineTotal: Number(row.line_total || 0),
  };
}

export function mapPurchaseOrder(row: Record<string, unknown>, lines: PurchaseOrderLine[]): PurchaseOrder {
  return {
    id: String(row.id),
    poNumber: String(row.po_number || row.id),
    supplierId: String(row.supplier_id),
    supplierName: (row.supplier_name as string) ?? null,
    status: (row.status as PurchaseOrder["status"]) || "draft",
    orderDate: String(row.order_date || new Date().toISOString().slice(0, 10)),
    expectedDeliveryDate: (row.expected_delivery_date as string) ?? null,
    lines,
    subtotal: Number(row.subtotal || 0),
    taxAmount: Number(row.tax_amount || 0),
    total: Number(row.total || 0),
    notes: (row.notes as string) ?? null,
    approvedAt: (row.approved_at as string) ?? null,
    approvedBy: (row.approved_by as string) ?? null,
    cancelledAt: (row.cancelled_at as string) ?? null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    deletedAt: (row.deleted_at as string) ?? null,
    branchId: (row.branch_id as string) ?? null,
    createdBy: (row.created_by as string) ?? null,
    version: Number(row.version || 1),
  };
}


export function mapGoodsReceiptLine(row: Record<string, unknown>): GoodsReceiptLine {
  return {
    id: String(row.id),
    goodsReceiptId: String(row.goods_receipt_id),
    purchaseOrderLineId: String(row.purchase_order_line_id),
    productId: (row.product_id as string) ?? null,
    warehouseLocationId: (row.warehouse_location_id as string) ?? null,
    description: String(row.description || ""),
    receivedQuantity: Number(row.received_quantity || 0),
    unitCost: Number(row.unit_cost || 0),
    lineTotal: Number(row.line_total || 0),
  };
}

export function mapGoodsReceipt(row: Record<string, unknown>, lines: GoodsReceiptLine[]): GoodsReceipt {
  return {
    id: String(row.id),
    grnNumber: String(row.grn_number || row.id),
    purchaseOrderId: String(row.purchase_order_id),
    poNumber: String(row.po_number || ""),
    supplierId: String(row.supplier_id),
    supplierName: (row.supplier_name as string) ?? null,
    receiptDate: String(row.receipt_date || new Date().toISOString().slice(0, 10)),
    lines,
    subtotal: Number(row.subtotal || 0),
    notes: (row.notes as string) ?? null,
    createdAt: String(row.created_at || new Date().toISOString()),
    branchId: (row.branch_id as string) ?? null,
    createdBy: (row.created_by as string) ?? null,
    version: Number(row.version || 1),
  };
}


export function mapPurchaseInvoiceLine(row: Record<string, unknown>): PurchaseInvoiceLine {
  return {
    id: String(row.id),
    purchaseInvoiceId: String(row.purchase_invoice_id),
    purchaseOrderLineId: (row.purchase_order_line_id as string) ?? null,
    productId: (row.product_id as string) ?? null,
    description: String(row.description || ""),
    invoicedQuantity: Number(row.invoiced_quantity || 0),
    unitCost: Number(row.unit_cost || 0),
    taxRate: Number(row.tax_rate || 0),
    lineSubtotal: Number(row.line_subtotal || 0),
    taxAmount: Number(row.tax_amount || 0),
    lineTotal: Number(row.line_total || 0),
  };
}

export function mapPurchaseInvoice(row: Record<string, unknown>, lines: PurchaseInvoiceLine[]): PurchaseInvoice {
  return {
    id: String(row.id),
    invoiceNumber: String(row.invoice_number || row.id),
    supplierInvoiceNumber: (row.supplier_invoice_number as string) ?? null,
    purchaseOrderId: (row.purchase_order_id as string) ?? null,
    poNumber: (row.po_number as string) ?? null,
    supplierId: String(row.supplier_id),
    supplierName: (row.supplier_name as string) ?? null,
    status: (row.status as PurchaseInvoice["status"]) || "draft",
    invoiceDate: String(row.invoice_date || new Date().toISOString().slice(0, 10)),
    dueDate: (row.due_date as string) ?? null,
    lines,
    subtotal: Number(row.subtotal || 0),
    taxAmount: Number(row.tax_amount || 0),
    total: Number(row.total || 0),
    paidAmount: Number(row.paid_amount || 0),
    balanceAmount: Number(row.balance_amount || 0),
    notes: (row.notes as string) ?? null,
    postedAt: (row.posted_at as string) ?? null,
    cancelledAt: (row.cancelled_at as string) ?? null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    branchId: (row.branch_id as string) ?? null,
    createdBy: (row.created_by as string) ?? null,
    version: Number(row.version || 1),
  };
}


export function mapAccountingAccount(row: Record<string, unknown>): AccountingAccount {
  return {
    id: String(row.id),
    code: String(row.code || ""),
    name: String(row.name || ""),
    type: (row.type as AccountingAccount["type"]) || "expense",
    normalBalance: (row.normal_balance as AccountingAccount["normalBalance"]) || "debit",
    parentId: (row.parent_id as string) ?? null,
    systemKey: (row.system_key as string) ?? null,
    isActive: row.is_active !== false,
    branchId: (row.branch_id as string) ?? null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    deletedAt: (row.deleted_at as string) ?? null,
    version: Number(row.version || 1),
  };
}

export function mapJournalEntryLine(row: Record<string, unknown>): JournalEntryLine {
  return {
    id: String(row.id),
    journalEntryId: String(row.journal_entry_id),
    accountId: String(row.account_id),
    accountCode: String(row.account_code || ""),
    accountName: String(row.account_name || ""),
    debit: Number(row.debit || 0),
    credit: Number(row.credit || 0),
    memo: (row.memo as string) ?? null,
  };
}

export function mapJournalEntry(row: Record<string, unknown>, lines: JournalEntryLine[]): JournalEntry {
  return {
    id: String(row.id),
    journalNumber: String(row.journal_number || row.id),
    entryDate: String(row.entry_date || new Date().toISOString().slice(0, 10)),
    description: String(row.description || ""),
    referenceType: (row.reference_type as string) ?? null,
    referenceId: (row.reference_id as string) ?? null,
    status: (row.status as JournalEntry["status"]) || "draft",
    lines,
    totalDebit: Number(row.total_debit || 0),
    totalCredit: Number(row.total_credit || 0),
    postedAt: (row.posted_at as string) ?? null,
    voidedAt: (row.voided_at as string) ?? null,
    reversalJournalId: (row.reversal_journal_id as string) ?? null,
    branchId: (row.branch_id as string) ?? null,
    createdBy: (row.created_by as string) ?? null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    version: Number(row.version || 1),
  };
}
