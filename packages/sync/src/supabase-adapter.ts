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

export function createSupabaseCloudAdapter(client: PgClient, deviceId: UUID): CloudAdapter {
  return {
    async push(events: OutboxEvent[]) {
      const accepted: UUID[] = [];
      const rejected: Array<{ id: UUID; error: string; remote?: VersionedRecord }> = [];
      for (const ev of events) {
        try {
          const payload = typeof ev.payload === "string" ? JSON.parse(ev.payload) : ev.payload;
          const table = ev.aggregateType;
          if (ev.eventType === "delete") {
            const r = await client.update(table, `id=eq.${ev.aggregateId}`, {
              deleted_at: new Date().toISOString(),
            });
            if (r.error) rejected.push({ id: ev.id, error: r.error });
            else accepted.push(ev.id);
          } else {
            const r = await client.insert(table, {
              ...(payload as object),
              id: ev.aggregateId,
            });
            // If conflict, try update
            if (r.error) {
              const u = await client.update(
                table,
                `id=eq.${ev.aggregateId}`,
                payload as Record<string, unknown>
              );
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
          rejected.push({
            id: ev.id,
            error: e instanceof Error ? e.message : String(e),
          });
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
      ];
      const records: Array<{ tableName: string; record: VersionedRecord }> = [];
      for (const table of tables) {
        const q = `select=*&updated_at=gt.${encodeURIComponent(since)}&order=updated_at.asc`;
        const res = await client.select(table, q);
        if (res.data) {
          for (const row of res.data) {
            records.push({
              tableName: table,
              record: {
                id: String(row.id),
                version: Number(row.version || 1),
                updatedAt: String(row.updated_at || since),
                deletedAt: (row.deleted_at as string) || null,
                ...row,
              } as VersionedRecord,
            });
          }
        }
      }
      return { records, serverTime: new Date().toISOString() };
    },
  };
}
