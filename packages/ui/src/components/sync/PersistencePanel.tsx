"use client";

import * as React from "react";
import { Button } from "../Button";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";

export function PersistencePanel({
  onExport,
  onImport,
  onSaveLocal,
  onLoadLocal,
  lastMessage,
}: {
  onExport: () => string;
  onImport: (json: string) => { ok: boolean; error?: string; counts?: Record<string, number> };
  onSaveLocal?: () => void;
  onLoadLocal?: () => void;
  lastMessage?: string | null;
}) {
  const [msg, setMsg] = React.useState<string | null>(lastMessage ?? null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  function download() {
    const json = onExport();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `minarvabiz-domain-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg("Snapshot downloaded");
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = onImport(String(reader.result || ""));
      setMsg(
        result.ok
          ? `Imported: ${Object.entries(result.counts || {})
              .map(([k, v]) => `${k}=${v}`)
              .join(", ")}`
          : result.error || "Import failed"
      );
    };
    reader.readAsText(file);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Domain persistence</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-500">
          Export/import full domain snapshot (customers, products, sales, orders, staff…).
          Desktop also persists via Electron userData JSON.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={download}>Export snapshot</Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            Import snapshot
          </Button>
          {onSaveLocal && (
            <Button variant="outline" onClick={() => { onSaveLocal(); setMsg("Saved to local store"); }}>
              Save local
            </Button>
          )}
          {onLoadLocal && (
            <Button variant="outline" onClick={() => { onLoadLocal(); setMsg("Loaded from local store"); }}>
              Load local
            </Button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={handleFile} />
        {msg && <p className="text-sm text-slate-600">{msg}</p>}
      </CardContent>
    </Card>
  );
}
