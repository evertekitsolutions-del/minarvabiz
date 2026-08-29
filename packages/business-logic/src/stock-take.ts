/** Stock take / physical count adjustments */
import type { UUID } from "@minarvabiz/types";
import * as store from "./store";
import { touchPersistence } from "./autosave";
import { generateId, nowISO } from "@minarvabiz/utils";

export interface StockTakeLine {
  productId: UUID;
  systemQty: number;
  countedQty: number;
  variance: number;
}

export interface StockTakeSession {
  id: string;
  createdAt: string;
  closedAt: string | null;
  lines: StockTakeLine[];
  notes: string;
}

const sessions: StockTakeSession[] = [];

export function startStockTake(notes = ""): StockTakeSession {
  const products = store.listProducts();
  const session: StockTakeSession = {
    id: generateId(),
    createdAt: nowISO(),
    closedAt: null,
    notes,
    lines: products.map((p) => ({
      productId: p.id,
      systemQty: p.stockQuantity,
      countedQty: p.stockQuantity,
      variance: 0,
    })),
  };
  sessions.unshift(session);
  return session;
}

export function updateStockTakeCount(
  sessionId: string,
  productId: UUID,
  countedQty: number
): StockTakeSession | null {
  const s = sessions.find((x) => x.id === sessionId);
  if (!s || s.closedAt) return null;
  const line = s.lines.find((l) => l.productId === productId);
  if (!line) return null;
  line.countedQty = countedQty;
  line.variance = countedQty - line.systemQty;
  return s;
}

export function commitStockTake(sessionId: string): { session: StockTakeSession | null; error?: string } {
  const s = sessions.find((x) => x.id === sessionId);
  if (!s) return { session: null, error: "Session not found" };
  if (s.closedAt) return { session: null, error: "Already committed" };
  for (const line of s.lines) {
    if (line.variance === 0) continue;
    store.adjustStock(line.productId, "adjustment", line.variance);
  }
  s.closedAt = nowISO();
  touchPersistence();
  return { session: s };
}

export function listStockTakes(): StockTakeSession[] {
  return [...sessions];
}

export function hydrateStockTakes(data: { sessions?: StockTakeSession[] }) {
  if (data.sessions) {
    sessions.length = 0;
    sessions.push(...data.sessions);
  }
}
