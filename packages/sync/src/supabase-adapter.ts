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
    case "warehouses":
      return {
        id: aggregateId, name: payload.name, code: payload.code, branch_id: payload.branchId ?? null,
        address: payload.address ?? null, is_active: payload.isActive !== false,
        created_at: payload.createdAt, updated_at: payload.updatedAt, version: payload.version ?? 1,
      };
    case "warehouse_bins":
      return {
        id: aggregateId, warehouse_id: payload.warehouseId, code: payload.code, name: payload.name ?? null,
        zone: payload.zone ?? null, aisle: payload.aisle ?? null, rack: payload.rack ?? null, shelf: payload.shelf ?? null,
        is_active: payload.isActive !== false, created_at: payload.createdAt, updated_at: payload.updatedAt, version: payload.version ?? 1,
      };
    case "warehouse_bin_stock":
      return {
        id: aggregateId, warehouse_id: payload.warehouseId, bin_id: payload.binId, product_id: payload.productId,
        quantity: payload.quantity ?? 0, reserved_quantity: payload.reservedQuantity ?? 0,
        updated_at: payload.updatedAt, version: payload.version ?? 1,
      };
    case "warehouse_transfers":
      return {
        id: aggregateId, transfer_number: payload.transferNumber, product_id: payload.productId,
        source_warehouse_id: payload.sourceWarehouseId, source_bin_id: payload.sourceBinId,
        destination_warehouse_id: payload.destinationWarehouseId, destination_bin_id: payload.destinationBinId,
        quantity: payload.quantity, status: payload.status, notes: payload.notes ?? null,
        requested_at: payload.requestedAt, approved_at: payload.approvedAt ?? null,
        dispatched_at: payload.dispatchedAt ?? null, completed_at: payload.completedAt ?? null,
        requested_by: payload.requestedBy ?? null, approved_by: payload.approvedBy ?? null,
        updated_at: payload.updatedAt, version: payload.version ?? 1,
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
    default:
      return { ...payload, id: aggregateId };
  }
}

function matchQuery(table: string, aggregateId: UUID): string {
  return table === "production_workflows" ? `order_id=eq.${aggregateId}` : `id=eq.${aggregateId}`;
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
        "sales", "sale_items", "payments", "measurement_profiles", "orders",
        "order_expenses", "laundry_orders", "expenses", "purchases", "suppliers",
        "staff_members", "sale_returns", "audit_logs",
        "production_workflows", "production_stage_events", "material_rolls", "material_consumptions",
        "warehouses", "warehouse_bins", "warehouse_bin_stock", "warehouse_transfers",
      ];
      const records: Array<{ tableName: string; record: VersionedRecord }> = [];
      for (const table of tables) {
        const q = `select=*&updated_at=gt.${encodeURIComponent(since)}&order=updated_at.asc`;
        const res = await client.select(table, q);
        if (res.data) {
          for (const row of res.data) {
            const recordId = table === "production_workflows" ? String(row.order_id) : String(row.id);
            records.push({
              tableName: table,
              record: {
                ...row,
                id: recordId,
                version: Number(row.version || 1),
                updatedAt: String(row.updated_at || row.changed_at || row.created_at || since),
                deletedAt: (row.deleted_at as string) || null,
              } as VersionedRecord,
            });
          }
        }
      }
      return { records, serverTime: new Date().toISOString() };
    },
  };
}
