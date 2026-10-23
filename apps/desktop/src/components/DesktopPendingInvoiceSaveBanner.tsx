import * as React from "react";
import { Button } from "@minarvabiz/ui";

/** An invoice already exists in memory. Never offer to recreate it as a new sale. */
export function DesktopPendingInvoiceSaveBanner({ onRetry }: { onRetry: () => Promise<void> }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <div role="alert" className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
      <p>An invoice exists in this session but its SQLite save was not confirmed. Do not close the app or create another sale until it is saved.</p>
      <Button type="button" variant="outline" disabled={busy} onClick={async () => {
        setBusy(true);
        try { await onRetry(); } finally { setBusy(false); }
      }}>{busy ? "Retrying SQLite save…" : "Retry saving existing invoice"}</Button>
    </div>
  );
}
