"use client";

import * as React from "react";
import { Button } from "../Button";
import { Modal } from "../forms/Modal";

export interface PrintPreviewModalProps {
  open: boolean;
  title: string;
  html: string;
  paper: "a4" | "thermal" | "label";
  onClose: () => void;
  onPrint: () => void;
}

export function PrintPreviewModal({ open, title, html, paper, onClose, onPrint }: PrintPreviewModalProps) {
  const frameTitle = `${title} preview`;
  const shellClass =
    paper === "thermal"
      ? "mx-auto w-[360px] max-w-full bg-white shadow-sm"
      : paper === "label"
        ? "mx-auto w-[420px] max-w-full bg-white shadow-sm"
        : "mx-auto w-full max-w-[900px] bg-white shadow-sm";

  return (
    <Modal
      open={open}
      title={title}
      className="max-w-6xl"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          <Button type="button" onClick={onPrint}>Print</Button>
        </>
      }
    >
      <div className="rounded-xl border border-slate-200 bg-slate-100 p-3 sm:p-5">
        <div className={shellClass}>
          <iframe
            title={frameTitle}
            srcDoc={html}
            sandbox=""
            className={paper === "thermal" ? "h-[680px] w-full border-0" : paper === "label" ? "h-[420px] w-full border-0" : "h-[72vh] min-h-[680px] w-full border-0"}
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        This is the application preview. The final printer may apply its own margins unless direct printing is enabled in Settings.
      </p>
    </Modal>
  );
}
