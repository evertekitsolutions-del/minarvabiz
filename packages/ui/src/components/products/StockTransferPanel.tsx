"use client";

import * as React from "react";
import type { Product, StockTransferRecord } from "@minarvabiz/types";
import { Button } from "../Button";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { FormField, inputClass, selectClass } from "../forms/FormField";

export interface StockTransferActionResult {
  success: boolean;
  transfer?: StockTransferRecord | null;
  errors?: string[];
}

export function StockTransferPanel({
  products,
  transfers,
  onRequest,
  onApprove,
  onCancel,
}: {
  products: Product[];
  transfers: StockTransferRecord[];
  onRequest: (payload: {
    sourceProductId: string;
    destinationProductId: string;
    quantity: number;
    notes?: string | null;
  }) => StockTransferActionResult;
  onApprove: (id: string) => StockTransferActionResult;
  onCancel: (id: string) => StockTransferActionResult;
}) {
  const [sourceProductId, setSourceProductId] = React.useState("");
  const [destinationProductId, setDestinationProductId] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [notes, setNotes] = React.useState("");
  const [message, setMessage] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);

  const source = products.find((product) => product.id === sourceProductId);
  const destinations = products.filter((product) => {
    if (!source || product.id === source.id) return false;
    if (source.sku && product.sku) return source.sku.trim().toLowerCase() === product.sku.trim().toLowerCase();
    if (source.barcode && product.barcode) return source.barcode.trim() === product.barcode.trim();
    return source.name.trim().toLowerCase() === product.name.trim().toLowerCase();
  });

  React.useEffect(() => {
    if (destinationProductId && !destinations.some((product) => product.id === destinationProductId)) {
      setDestinationProductId("");
    }
  }, [destinationProductId, destinations]);

  function requestTransfer() {
    const qty = Number(quantity);
    const result = onRequest({
      sourceProductId,
      destinationProductId,
      quantity: qty,
      notes: notes.trim() || null,
    });
    if (!result.success) {
      setMessage({ type: "err", text: (result.errors || ["Unable to create transfer request"]).join("; ") });
      return;
    }
    setMessage({
      type: "ok",
      text: `${result.transfer?.referenceNumber || "Transfer"} submitted for approval. Stock has not moved yet.`,
    });
    setSourceProductId("");
    setDestinationProductId("");
    setQuantity("1");
    setNotes("");
  }

  const pending = transfers.filter((transfer) => transfer.status === "pending").length;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">Stock Transfer Control</CardTitle>
          <p className="mt-1 text-xs text-slate-500">
            Request first, approve second. Stock moves only after approval.
          </p>
        </div>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
          {pending} pending
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-5">
          <FormField label="Source stock record">
            <select
              aria-label="Transfer source"
              className={selectClass}
              value={sourceProductId}
              onChange={(event) => setSourceProductId(event.target.value)}
            >
              <option value="">Select source</option>
              {products.filter((product) => product.isActive).map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}{product.sku ? ` · ${product.sku}` : ""} · stock {product.stockQuantity}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Destination stock record">
            <select
              aria-label="Transfer destination"
              className={selectClass}
              value={destinationProductId}
              onChange={(event) => setDestinationProductId(event.target.value)}
              disabled={!sourceProductId}
            >
              <option value="">Select destination</option>
              {destinations.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}{product.sku ? ` · ${product.sku}` : ""} · stock {product.stockQuantity}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Quantity">
            <input
              aria-label="Transfer quantity"
              className={inputClass}
              type="number"
              min="0.001"
              step="0.001"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </FormField>
          <FormField label="Notes">
            <input
              aria-label="Transfer notes"
              className={inputClass}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Reason / reference"
            />
          </FormField>
          <div className="flex items-end">
            <Button
              type="button"
              className="w-full"
              disabled={!sourceProductId || !destinationProductId || !(Number(quantity) > 0)}
              onClick={requestTransfer}
            >
              Request Transfer
            </Button>
          </div>
        </div>

        {source && destinations.length === 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            No matching destination stock record exists for this SKU/barcode/product. Create the same item for the destination branch first.
          </p>
        )}

        {message && (
          <p className={`rounded-lg px-3 py-2 text-sm ${message.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            {message.text}
          </p>
        )}

        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Transfer history</div>
          {transfers.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">
              No transfer requests yet.
            </p>
          )}
          {transfers.slice(0, 25).map((transfer) => {
            const from = products.find((product) => product.id === transfer.sourceProductId);
            const to = products.find((product) => product.id === transfer.destinationProductId);
            return (
              <div
                key={transfer.id}
                className="flex flex-col gap-2 rounded-xl border border-slate-100 px-3 py-3 text-sm lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">{transfer.referenceNumber}</div>
                  <div className="text-xs text-slate-500">
                    {from?.name || transfer.sourceProductId} → {to?.name || transfer.destinationProductId} · Qty {transfer.quantity}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    Requested {new Date(transfer.requestedAt).toLocaleString("en-IN")}
                    {transfer.approvedAt ? ` · Approved ${new Date(transfer.approvedAt).toLocaleString("en-IN")}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      transfer.status === "pending"
                        ? "bg-amber-50 text-amber-700"
                        : transfer.status === "completed"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {transfer.status}
                  </span>
                  {transfer.status === "pending" && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          const result = onApprove(transfer.id);
                          setMessage({
                            type: result.success ? "ok" : "err",
                            text: result.success
                              ? `${transfer.referenceNumber} approved. Stock moved successfully.`
                              : (result.errors || ["Approval failed"]).join("; "),
                          });
                        }}
                      >
                        Approve & Move
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const result = onCancel(transfer.id);
                          setMessage({
                            type: result.success ? "ok" : "err",
                            text: result.success
                              ? `${transfer.referenceNumber} cancelled.`
                              : (result.errors || ["Cancellation failed"]).join("; "),
                          });
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
