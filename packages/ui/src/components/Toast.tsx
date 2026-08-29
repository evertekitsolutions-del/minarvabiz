"use client";

import * as React from "react";
import { cn } from "../lib/cn";

type ToastItem = { id: number; message: string; tone?: "default" | "success" | "error" };

const ToastCtx = React.createContext<{
  push: (message: string, tone?: ToastItem["tone"]) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const push = React.useCallback((message: string, tone: ToastItem["tone"] = "default") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto rounded-lg px-4 py-2 text-sm shadow-lg",
              t.tone === "success" && "bg-emerald-600 text-white",
              t.tone === "error" && "bg-rose-600 text-white",
              (!t.tone || t.tone === "default") && "bg-slate-900 text-white"
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastCtx);
  return ctx ?? { push: () => undefined };
}
