/**
 * CloudAdapter implementation using PostgREST outbox + pull.
 */
import type { OutboxEvent, UUID } from "@minarvabiz/types";
import type { CloudAdapter } from "./engine";
import type { VersionedRecord } from "./conflict";

export interface PgClient {
  insert: (table: string, row: Record<string, unknown> | Record<string, unknown>[]) => Promise<{ error: string | null }>;
  select: (table: string, query: string) => Promise<{ data: Record<string, unknown>[] | null; error: string | null }>;
  update: (table: string, match: string, patch: Record<string, unknown>) => Promise<{ error: string | null }>;
}

function remoteRow(table: string, aggregateId: UUID, payload: Record<string, unknown>): Record<string, unknown> {
  switch (table) {
    case "laundry_orders":
      return {
        id: aggregateId,
        order_number: payload.orderNumber ?? null,
        customer_id: payload.customerId ?? null,
        customer_name: payload.customerName ?? null,
        mode: payload.mode ?? "outsourced",
        supplier_id: payload.supplierId ?? null,
        supplier_name: payload.supplierName ?? null,
        garment: payload.garment ?? "Laundry",
        quantity: payload.quantity ?? 1,
        customer_rate: payload.customerRate ?? 0,
        supplier_rate: payload.supplierRate ?? 0,
        total_customer_charge: payload.totalCustomerCharge ?? 0,
        total_supplier_cost: payload.totalSupplierCost ?? 0,
        paid_amount: payload.paidAmount ?? 0,
        balance_amount: payload.balanceAmount ?? 0,
        status: payload.status ?? "pending",
        notes: payload.notes ?? null,
        created_at: payload.createdAt ?? new Date().toISOString(),
        updated_at: payload.updatedAt ?? new Date().toISOString(),
        deleted_at: payload.deletedAt ?? null,
        branch_id: payload.branchId ?? null,
        device_id: payload.deviceId ?? null,
        version: payload.version ?? 1,
      };
    case "payments":
      return {
        id: aggregateId,
        amount: payload.amount ?? 0,
        method: payload.method,
        reference_type: payload.referenceType,
        reference_id: payload.referenceId,
        customer_id: payload.customerId ?? null,
        notes: payload.notes ?? null,
        paid_at: payload.paidAt ?? new Date().toISOString(),
        created_at: payload.createdAt ?? new Date().toISOString(),
        created_by: payload.createdBy ?? null,
        branch_id: payload.branchId ?? null,
        device_id: payload.deviceId ?? null,
        version: payload.version ?? 1,
      };
    case "expenses":
      return {
        id: aggregateId,
        category_id: payload.categoryId ?? null,
        description: payload.description ?? payload.categoryName ?? "Expense",
        amount: payload.amount ?? 0,
        date: String(payload.date ?? new Date().toISOString()).slice(0, 10),
        payment_method: payload.paymentMethod ?? null,
        order_id: payload.orderId ?? null,
        supplier_id: null,
        notes: payload.reference ?? null,
        created_at: payload.createdAt ?? new Date().toISOString(),
        updated_at: payload.updatedAt ?? new Date().toISOString(),
        deleted_at: payload.deletedAt ?? null,
        branch_id: payload.branchId ?? null,
        device_id: payload.deviceId ?? null,
        version: payload.version ?? 1,
      };
    case "purchases":
      return {
        id: aggregateId,
        supplier_id: payload.supplierId ?? null,
        doc_number: payload.purchaseNumber ?? null,
        kind: payload.kind ?? "general",
        order_id: payload.orderId ?? null,
        total: payload.amount ?? 0,
        paid: payload.paidAmount ?? 0,
        balance: payload.balanceAmount ?? 0,
        date: String(payload.date ?? new Date().toISOString()).slice(0, 10),
        notes: payload.notes ?? payload.description ?? null,
        created_at: payload.createdAt ?? new Date().toISOString(),
        updated_at: payload.updatedAt ?? new Date().toISOString(),
        deleted_at: payload.deletedAt ?? null,
        branch_id: payload.branchId ?? null,
        device_id: payload.deviceId ?? null,
        version: payload.version ?? 1,
      };
    case "production_workflows":
      return {
        id: aggregateId,
        order_id: payload.orderId ?? aggregateId,
        stage: payload.stage,
        started_at: payload.startedAt,
        updated_at: payload.updatedAt,
        completed_at: payload.completedAt ?? null,
        rework_count: payload.reworkCount ?? 0,
        events_json: payload.events ?? [],
      };
    case "production_stage_events":
      return {
        id: aggregateId,
        order_id: payload.orderId,
        from_stage: payload.from ?? null,
        to_stage: payload.to,
        changed_at: payload.changedAt,
        changed_by: payload.changedBy ?? null,
        notes: payload.notes ?? null,
        updated_at: payload.changedAt ?? new Date().toISOString(),
      };
    case "material_rolls":
      return {
        id: aggregateId,
        material_id: payload.materialId,
        batch_id: payload.batchId ?? null,
        shade_code: payload.shadeCode ?? null,
        width_meters: payload.widthMeters ?? null,
        quantity_meters: payload.quantityMeters ?? 0,
        reserved_meters: payload.reservedMeters ?? 0,
        cost_per_meter: payload.costPerMeter ?? 0,
        received_at: payload.receivedAt ?? new Date().toISOString(),
        active: payload.active ?? true,
        updated_at: new Date().toISOString(),
      };
    case "material_consumptions":
      return {
        id: aggregateId,
        material_id: payload.materialId,
        planned_meters: payload.plannedMeters ?? 0,
        actual_meters: payload.actualMeters ?? 0,
        unit_cost: payload.unitCost ?? 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    case "warehouses":
      return {
        id: aggregateId,
        branch_id: payload.branchId ?? null,
        name: payload.name,
        code: payload.code,
        is_default: payload.isDefault ?? false,
        is_active: payload.isActive ?? true,
        created_at: payload.createdAt ?? new Date().toISOString(),
        updated_at: payload.updatedAt ?? new Date().toISOString(),
        deleted_at: payload.deletedAt ?? null,
        version: payload.version ?? 1,
      };
    case "warehouse_locations":
      return {
        id: aggregateId,
        warehouse_id: payload.warehouseId,
        code: payload.code,
        name: payload.name,
        type: payload.type ?? "storage",
        is_active: payload.isActive ?? true,
        created_at: payload.createdAt ?? new Date().toISOString(),
        updated_at: payload.updatedAt ?? new Date().toISOString(),
        deleted_at: payload.deletedAt ?? null,
        version: payload.version ?? 1,
      };
    case "warehouse_stock":
      return {
        id: aggregateId,
        warehouse_id: payload.warehouseId,
        location_id: payload.locationId,
        product_id: payload.productId,
        on_hand: payload.onHand ?? 0,
        reserved: payload.reserved ?? 0,
        updated_at: payload.updatedAt ?? new Date().toISOString(),
        version: payload.version ?? 1,
      };
    case "warehouse_transfers":
      return {
        id: aggregateId,
        transfer_number: payload.transferNumber,
        product_id: payload.productId,
        source_warehouse_id: payload.sourceWarehouseId,
        source_location_id: payload.sourceLocationId,
        destination_warehouse_id: payload.destinationWarehouseId,
        destination_location_id: payload.destinationLocationId,
        quantity: payload.quantity ?? 0,
        status: payload.status ?? "draft",
        notes: payload.notes ?? null,
        created_at: payload.createdAt ?? new Date().toISOString(),
        updated_at: payload.updatedAt ?? new Date().toISOString(),
        approved_at: payload.approvedAt ?? null,
        dispatched_at: payload.dispatchedAt ?? null,
        received_at: payload.receivedAt ?? null,
        cancelled_at: payload.cancelledAt ?? null,
        created_by: payload.createdBy ?? null,
        version: payload.version ?? 1,
      };
    case "purchase_orders":
      return {
        id: aggregateId,
        branch_id: payload.branchId ?? null,
        po_number: payload.poNumber,
        supplier_id: payload.supplierId,
        supplier_name: payload.supplierName ?? null,
        status: payload.status ?? "draft",
        order_date: String(payload.orderDate ?? new Date().toISOString()).slice(0, 10),
        expected_delivery_date: payload.expectedDeliveryDate ? String(payload.expectedDeliveryDate).slice(0, 10) : null,
        subtotal: payload.subtotal ?? 0,
        tax_amount: payload.taxAmount ?? 0,
        total: payload.total ?? 0,
        notes: payload.notes ?? null,
        approved_at: payload.approvedAt ?? null,
        approved_by: payload.approvedBy ?? null,
        cancelled_at: payload.cancelledAt ?? null,
        created_at: payload.createdAt ?? new Date().toISOString(),
        updated_at: payload.updatedAt ?? new Date().toISOString(),
        deleted_at: payload.deletedAt ?? null,
        created_by: payload.createdBy ?? null,
        version: payload.version ?? 1,
      };
    case "purchase_order_lines":
      return {
        id: aggregateId,
        purchase_order_id: payload.purchaseOrderId,
        product_id: payload.productId ?? null,
        description: payload.description,
        ordered_quantity: payload.orderedQuantity ?? 0,
        received_quantity: payload.receivedQuantity ?? 0,
        unit_cost: payload.unitCost ?? 0,
        tax_rate: payload.taxRate ?? 0,
        line_subtotal: payload.lineSubtotal ?? 0,
        tax_amount: payload.taxAmount ?? 0,
        line_total: payload.lineTotal ?? 0,
        updated_at: new Date().toISOString(),
        version: 1,
      };
    case "goods_receipts":
      return {
        id: aggregateId,
        branch_id: payload.branchId ?? null,
        grn_number: payload.grnNumber,
        purchase_order_id: payload.purchaseOrderId,
        po_number: payload.poNumber,
        supplier_id: payload.supplierId,
        supplier_name: payload.supplierName ?? null,
        receipt_date: String(payload.receiptDate ?? new Date().toISOString()).slice(0, 10),
        subtotal: payload.subtotal ?? 0,
        notes: payload.notes ?? null,
        created_at: payload.createdAt ?? new Date().toISOString(),
        updated_at: payload.updatedAt ?? payload.createdAt ?? new Date().toISOString(),
        created_by: payload.createdBy ?? null,
        version: payload.version ?? 1,
      };
    case "goods_receipt_lines":
      return {
        id: aggregateId,
        goods_receipt_id: payload.goodsReceiptId,
        purchase_order_line_id: payload.purchaseOrderLineId,
        product_id: payload.productId ?? null,
        warehouse_location_id: payload.warehouseLocationId ?? null,
        description: payload.description,
        received_quantity: payload.receivedQuantity ?? 0,
        unit_cost: payload.unitCost ?? 0,
        line_total: payload.lineTotal ?? 0,
        created_at: payload.createdAt ?? new Date().toISOString(),
        updated_at: payload.updatedAt ?? payload.createdAt ?? new Date().toISOString(),
      };
    case "accounts":
      return {
        id: aggregateId,
        branch_id: payload.branchId ?? null,
        code: payload.code,
        name: payload.name,
        type: payload.type,
        normal_balance: payload.normalBalance,
        parent_id: payload.parentId ?? null,
        system_key: payload.systemKey ?? null,
        is_active: payload.isActive ?? true,
        created_at: payload.createdAt ?? new Date().toISOString(),
        updated_at: payload.updatedAt ?? new Date().toISOString(),
        deleted_at: payload.deletedAt ?? null,
        version: payload.version ?? 1,
      };
    case "journal_entries":
      return {
        id: aggregateId,
        branch_id: payload.branchId ?? null,
        journal_number: payload.journalNumber,
        entry_date: String(payload.entryDate ?? new Date().toISOString()).slice(0, 10),
        description: payload.description,
        reference_type: payload.referenceType ?? null,
        reference_id: payload.referenceId ?? null,
        status: payload.status ?? "draft",
        total_debit: payload.totalDebit ?? 0,
        total_credit: payload.totalCredit ?? 0,
        posted_at: payload.postedAt ?? null,
        voided_at: payload.voidedAt ?? null,
        reversal_journal_id: payload.reversalJournalId ?? null,
        created_by: payload.createdBy ?? null,
        created_at: payload.createdAt ?? new Date().toISOString(),
        updated_at: payload.updatedAt ?? new Date().toISOString(),
        version: payload.version ?? 1,
      };
    case "journal_entry_lines":
      return {
        id: aggregateId,
        journal_entry_id: payload.journalEntryId,
        account_id: payload.accountId,
        account_code: payload.accountCode,
        account_name: payload.accountName,
        debit: payload.debit ?? 0,
        credit: payload.credit ?? 0,
        memo: payload.memo ?? null,
        created_at: payload.createdAt ?? new Date().toISOString(),
        updated_at: payload.updatedAt ?? payload.createdAt ?? new Date().toISOString(),
      };
    case "purchase_invoices":
      return {
        id: aggregateId,
        branch_id: payload.branchId ?? null,
        invoice_number: payload.invoiceNumber,
        supplier_invoice_number: payload.supplierInvoiceNumber ?? null,
        purchase_order_id: payload.purchaseOrderId ?? null,
        po_number: payload.poNumber ?? null,
        supplier_id: payload.supplierId,
        supplier_name: payload.supplierName ?? null,
        status: payload.status ?? "draft",
        invoice_date: String(payload.invoiceDate ?? new Date().toISOString()).slice(0, 10),
        due_date: payload.dueDate ? String(payload.dueDate).slice(0, 10) : null,
        subtotal: payload.subtotal ?? 0,
        tax_amount: payload.taxAmount ?? 0,
        total: payload.total ?? 0,
        paid_amount: payload.paidAmount ?? 0,
        balance_amount: payload.balanceAmount ?? 0,
        notes: payload.notes ?? null,
        posted_at: payload.postedAt ?? null,
        cancelled_at: payload.cancelledAt ?? null,
        created_at: payload.createdAt ?? new Date().toISOString(),
        updated_at: payload.updatedAt ?? new Date().toISOString(),
        created_by: payload.createdBy ?? null,
        version: payload.version ?? 1,
      };
    case "purchase_invoice_lines":
      return {
        id: aggregateId,
        purchase_invoice_id: payload.purchaseInvoiceId,
        purchase_order_line_id: payload.purchaseOrderLineId ?? null,
        product_id: payload.productId ?? null,
        description: payload.description,
        invoiced_quantity: payload.invoicedQuantity ?? 0,
        unit_cost: payload.unitCost ?? 0,
        tax_rate: payload.taxRate ?? 0,
        line_subtotal: payload.lineSubtotal ?? 0,
        tax_amount: payload.taxAmount ?? 0,
        line_total: payload.lineTotal ?? 0,
        created_at: payload.createdAt ?? new Date().toISOString(),
        updated_at: payload.updatedAt ?? new Date().toISOString(),
        version: payload.version ?? 1,
      };
    default:
      return { ...payload, id: aggregateId };
  }
}

function matchQuery(table: string, aggregateId: UUID): string {
  return table === "production_workflows" ? `order_id=eq.${aggregateId}` : `id=eq.${aggregateId}`;
}

function pullCursorColumn(table: string): string {
  switch (table) {
    case "inventory_transactions":
    case "payments":
    case "order_expenses":
    case "audit_logs":
    case "goods_receipts":
    case "goods_receipt_lines":
      return "created_at";
    default:
      return "updated_at";
  }
}

function pullQuery(table: string, since: string): string {
  const cursor = pullCursorColumn(table);
  return `select=*&${cursor}=gt.${encodeURIComponent(since)}&order=${cursor}.asc`;
}

export function createSupabaseCloudAdapter(client: PgClient, deviceId: UUID): CloudAdapter {
  return {
    async push(events: OutboxEvent[]) {
      const accepted: UUID[] = [];
      const rejected: Array<{ id: UUID; error: string; remote?: VersionedRecord }> = [];
      for (const ev of events) {
        try {
          const payload = typeof ev.payload === "string" ? JSON.parse(ev.payload) : ev.payload;
          const table = ev.aggregateType;
          const row = remoteRow(table, ev.aggregateId, payload as Record<string, unknown>);
          if (ev.eventType === "delete") {
            const r = await client.update(table, matchQuery(table, ev.aggregateId), {
              deleted_at: new Date().toISOString(),
            });
            if (r.error) rejected.push({ id: ev.id, error: r.error });
            else accepted.push(ev.id);
          } else {
            const r = await client.insert(table, row);
            if (r.error) {
              const u = await client.update(table, matchQuery(table, ev.aggregateId), row);
              if (u.error) rejected.push({ id: ev.id, error: u.error });
              else accepted.push(ev.id);
            } else {
              accepted.push(ev.id);
            }
          }
          await client.insert("outbox_events", {
            id: ev.id,
            aggregate_type: ev.aggregateType,
            aggregate_id: ev.aggregateId,
            event_type: ev.eventType,
            payload_json: payload,
            occurred_at: ev.occurredAt,
            device_id: deviceId,
            sequence: ev.sequence,
            status: "synced",
            attempts: 0,
          });
        } catch (e) {
          rejected.push({ id: ev.id, error: e instanceof Error ? e.message : String(e) });
        }
      }
      return { accepted, rejected };
    },
    async pull(since: string, _deviceId: UUID) {
      const tables = [
        "branches", "customers", "categories", "products", "inventory_transactions",
        "sales", "payments", "measurement_profiles", "orders",
        "order_expenses", "laundry_orders", "expenses", "purchases", "suppliers",
        "staff_members", "sale_returns", "audit_logs",
        "production_workflows", "production_stage_events", "material_rolls", "material_consumptions",
        "warehouses", "warehouse_locations", "warehouse_stock", "warehouse_transfers",
        "purchase_orders", "purchase_order_lines", "goods_receipts", "goods_receipt_lines",
        "purchase_invoices", "purchase_invoice_lines",
        "accounts", "journal_entries", "journal_entry_lines",
      ];
      const records: Array<{ tableName: string; record: VersionedRecord }> = [];
      const pulledSales = new Map<string, string>();

      for (const table of tables) {
        const cursor = pullCursorColumn(table);
        const res = await client.select(table, pullQuery(table, since));
        if (res.data) {
          for (const row of res.data) {
            const recordId = table === "production_workflows" ? String(row.order_id) : String(row.id);
            const updatedAt = String(row[cursor] || row.updated_at || row.changed_at || row.created_at || since);
            records.push({
              tableName: table,
              record: {
                ...row,
                id: recordId,
                version: Number(row.version || 1),
                updatedAt,
                deletedAt: (row.deleted_at as string) || null,
              } as VersionedRecord,
            });
            if (table === "sales") pulledSales.set(recordId, updatedAt);
          }
        }
      }

      // sale_items are immutable children and the core schema has no timestamp column.
      // Pull them only for sales that were pulled in this cycle and inherit the parent
      // sale timestamp for conflict ordering instead of issuing an invalid updated_at query.
      if (pulledSales.size > 0) {
        const saleIds = [...pulledSales.keys()];
        const q = `select=*&sale_id=in.(${saleIds.map(encodeURIComponent).join(",")})`;
        const res = await client.select("sale_items", q);
        if (res.data) {
          for (const row of res.data) {
            const saleId = String(row.sale_id);
            records.push({
              tableName: "sale_items",
              record: {
                ...row,
                id: String(row.id),
                version: Number(row.version || 1),
                updatedAt: pulledSales.get(saleId) || since,
                deletedAt: null,
              } as VersionedRecord,
            });
          }
        }
      }

      return { records, serverTime: new Date().toISOString() };
    },
  };
}
