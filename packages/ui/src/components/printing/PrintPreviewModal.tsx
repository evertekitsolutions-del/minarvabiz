"use client";

import * as React from "react";
import { Button } from "../Button";

export function PrintPreviewModal({
  open,
  title,
  html,
  paper,
  onClose,
  onPrint,
}: {
  open: boolean;
  title: string;
  html: string;
  paper: "a4" | "thermal";
  onClose: () => void;
  onPrint?: () => void;
}) {
  React.useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500">{paper === "a4" ? "A4 document preview" : "Thermal document preview"}</p>
          </div>
          <div className="flex gap-2">
            {onPrint && <Button onClick={onPrint}>Print</Button>}
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-3 sm:p-5">
          <div className={paper === "a4" ? "mx-auto h-full max-w-[900px]" : "mx-auto h-full max-w-[420px]"}>
            <iframe
              title={title}
              srcDoc={html}
              sandbox=""
              className="h-full min-h-[720px] w-full rounded-lg border border-slate-200 bg-white shadow-sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
