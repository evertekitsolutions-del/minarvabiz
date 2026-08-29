"use client";

import * as React from "react";
import { store, getRuntimeMode } from "@minarvabiz/business-logic";
import { isSupabaseConfigured } from "@minarvabiz/database";

export function SetupBanner() {
  const [show, setShow] = React.useState(false);
  React.useEffect(() => {
    const mode = getRuntimeMode();
    const hasData = store.listCustomers().length > 0 || store.listProducts().length > 0;
    const configured = isSupabaseConfigured();
    if (mode === "production" && !configured && !hasData) {
      setShow(true);
    }
  }, []);
  if (!show) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      Production mode: no database configured. Set{" "}
      <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and anon key, or
      use the desktop app with SQLite. Demo seed is disabled unless{" "}
      <code className="rounded bg-amber-100 px-1">MINARVA_MODE=demo</code>.
    </div>
  );
}
