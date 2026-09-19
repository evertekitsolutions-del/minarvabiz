"use client";

import * as React from "react";
import { warehouseStore, store } from "@minarvabiz/business-logic";
import type { WarehouseLocationType } from "@minarvabiz/types";
import { Button } from "../Button";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { FormField, inputClass, selectClass } from "../forms/FormField";

function qty(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function WarehousePanel() {
  const [tick, setTick] = React.useState(0);
  const [message, setMessage] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [warehouseForm, setWarehouseForm] = React.useState({ name: "", code: "", isDefault: false });
  const [locationForm, setLocationForm] = React.useState({ warehouseId: "", code: "", name: "", type: "storage" as WarehouseLocationType });
  const [allocationForm, setAllocationForm] = React.useState({ productId: "", locationId: "", quantity: "" });
  const [transferForm, setTransferForm] = React.useState({ productId: "", sourceLocationId: "", destinationLocationId: "", quantity: "", notes: "" });

  const products = store.listProducts();
  const warehouses = warehouseStore.listWarehouses();
  const locations = warehouseStore.listWarehouseLocations();
  const positions = warehouseStore.listWarehouseStock();
  const transfers = warehouseStore.listWarehouseTransfers();
  const totalsByProduct = Object.fromEntries(products.map((p) => [p.id, p.stockQuantity]));
  const summaries = warehouseStore.warehouseStockSummary(totalsByProduct)
    .filter((row) => row.total > 0 || row.allocated > 0)
    .sort((a, b) => b.allocated - a.allocated);

  const productName = (id: string) => products.find((p) => p.id === id)?.name || id;
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name || id;
  const locationName = (id: string) => {
    const location = locations.find((l) => l.id === id);
    return location ? `${warehouseName(location.warehouseId)} · ${location.code}` : id;
  };

  function refresh() {
    setTick((v) => v + 1);
  }

  function run(action: () => { errors?: string[]; error?: string; [key: string]: unknown }, success: string) {
    try {
      const result = action();
      const errors = result.errors || (result.error ? [result.error] : []);
      if (errors.length) {
        setMessage({ type: "err", text: errors.join("; ") });
        return false;
      }
      setMessage({ type: "ok", text: success });
      refresh();
      return true;
    } catch (error) {
      setMessage({ type: "err", text: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  void tick;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Warehouse Management</h2>
        <p className="mt-1 text-sm text-slate-500">Physical warehouses, bins/locations, stock allocation and controlled transfers.</p>
      </div>

      {message && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${message.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <Card><CardContent className="p-4"><div className="text-xs text-slate-500">Warehouses</div><div className="mt-1 text-2xl font-bold">{warehouses.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-slate-500">Locations</div><div className="mt-1 text-2xl font-bold">{locations.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-slate-500">Allocated units</div><div className="mt-1 text-2xl font-bold">{qty(positions.reduce((s, p) => s + p.onHand, 0))}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-slate-500">Open transfers</div><div className="mt-1 text-2xl font-bold">{transfers.filter((t) => !["received", "cancelled"].includes(t.status)).length}</div></CardContent></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">Create warehouse</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <FormField label="Name"><input className={inputClass} value={warehouseForm.name} onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })} placeholder="Main Store" /></FormField>
            <FormField label="Code"><input className={inputClass} value={warehouseForm.code} onChange={(e) => setWarehouseForm({ ...warehouseForm, code: e.target.value })} placeholder="MAIN" /></FormField>
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={warehouseForm.isDefault} onChange={(e) => setWarehouseForm({ ...warehouseForm, isDefault: e.target.checked })} /> Default warehouse</label>
            <div className="flex items-end"><Button onClick={() => {
              const ok = run(() => warehouseStore.createWarehouse(warehouseForm), "Warehouse created");
              if (ok) setWarehouseForm({ name: "", code: "", isDefault: false });
            }}>Create warehouse</Button></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">Create location / bin</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <FormField label="Warehouse"><select className={selectClass} value={locationForm.warehouseId} onChange={(e) => setLocationForm({ ...locationForm, warehouseId: e.target.value })}><option value="">Select warehouse</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></FormField>
            <FormField label="Code"><input className={inputClass} value={locationForm.code} onChange={(e) => setLocationForm({ ...locationForm, code: e.target.value })} placeholder="A-01" /></FormField>
            <FormField label="Name"><input className={inputClass} value={locationForm.name} onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })} placeholder="Rack A / Bin 01" /></FormField>
            <FormField label="Type"><select className={selectClass} value={locationForm.type} onChange={(e) => setLocationForm({ ...locationForm, type: e.target.value as WarehouseLocationType })}><option value="receiving">Receiving</option><option value="storage">Storage</option><option value="dispatch">Dispatch</option><option value="returns">Returns</option></select></FormField>
            <div className="sm:col-span-2"><Button onClick={() => {
              const ok = run(() => warehouseStore.createWarehouseLocation(locationForm), "Location created");
              if (ok) setLocationForm((v) => ({ warehouseId: v.warehouseId, code: "", name: "", type: "storage" }));
            }} disabled={!warehouses.length}>Create location</Button></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">Allocate existing stock to location</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <FormField label="Product"><select className={selectClass} value={allocationForm.productId} onChange={(e) => setAllocationForm({ ...allocationForm, productId: e.target.value })}><option value="">Select product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} · total {p.stockQuantity}</option>)}</select></FormField>
            <FormField label="Location"><select className={selectClass} value={allocationForm.locationId} onChange={(e) => setAllocationForm({ ...allocationForm, locationId: e.target.value })}><option value="">Select location</option>{locations.map((l) => <option key={l.id} value={l.id}>{locationName(l.id)}</option>)}</select></FormField>
            <FormField label="Quantity"><input className={inputClass} type="number" min="0.001" step="0.001" value={allocationForm.quantity} onChange={(e) => setAllocationForm({ ...allocationForm, quantity: e.target.value })} /></FormField>
            <div className="flex items-end"><Button onClick={() => {
              const product = products.find((p) => p.id === allocationForm.productId);
              if (!product) { setMessage({ type: "err", text: "Select a product" }); return; }
              const ok = run(() => warehouseStore.allocateExistingStock({
                productId: product.id,
                locationId: allocationForm.locationId,
                quantity: Number(allocationForm.quantity),
                productTotalStock: product.stockQuantity,
              }), "Stock allocated to location");
              if (ok) setAllocationForm((v) => ({ ...v, quantity: "" }));
            }} disabled={!locations.length || !products.length}>Allocate stock</Button></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">Create stock transfer</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <FormField label="Product"><select className={selectClass} value={transferForm.productId} onChange={(e) => setTransferForm({ ...transferForm, productId: e.target.value })}><option value="">Select product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></FormField>
            <FormField label="Quantity"><input className={inputClass} type="number" min="0.001" step="0.001" value={transferForm.quantity} onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })} /></FormField>
            <FormField label="Source location"><select className={selectClass} value={transferForm.sourceLocationId} onChange={(e) => setTransferForm({ ...transferForm, sourceLocationId: e.target.value })}><option value="">Select source</option>{locations.map((l) => <option key={l.id} value={l.id}>{locationName(l.id)}</option>)}</select></FormField>
            <FormField label="Destination location"><select className={selectClass} value={transferForm.destinationLocationId} onChange={(e) => setTransferForm({ ...transferForm, destinationLocationId: e.target.value })}><option value="">Select destination</option>{locations.map((l) => <option key={l.id} value={l.id}>{locationName(l.id)}</option>)}</select></FormField>
            <FormField label="Notes"><input className={inputClass} value={transferForm.notes} onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })} /></FormField>
            <div className="flex items-end"><Button onClick={() => {
              const ok = run(() => warehouseStore.createWarehouseTransfer({
                productId: transferForm.productId,
                sourceLocationId: transferForm.sourceLocationId,
                destinationLocationId: transferForm.destinationLocationId,
                quantity: Number(transferForm.quantity),
                notes: transferForm.notes || null,
              }), "Transfer draft created");
              if (ok) setTransferForm((v) => ({ ...v, quantity: "", notes: "" }));
            }} disabled={locations.length < 2}>Create transfer</Button></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold">Stock allocation summary</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="min-w-[760px] w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-2 text-left">Product</th><th className="px-4 py-2 text-right">Product stock</th><th className="px-4 py-2 text-right">Allocated</th><th className="px-4 py-2 text-right">Reserved</th><th className="px-4 py-2 text-right">Available allocated</th><th className="px-4 py-2 text-right">Unallocated</th></tr></thead>
            <tbody>{summaries.length ? summaries.map((row) => <tr key={row.productId} className="border-t border-slate-100"><td className="px-4 py-2 font-medium">{productName(row.productId)}</td><td className="px-4 py-2 text-right">{qty(row.total)}</td><td className="px-4 py-2 text-right">{qty(row.allocated)}</td><td className="px-4 py-2 text-right">{qty(row.reserved)}</td><td className="px-4 py-2 text-right">{qty(row.availableAllocated)}</td><td className="px-4 py-2 text-right">{qty(row.unallocated)}</td></tr>) : <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No stock to display</td></tr>}</tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold">Transfer workflow</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!transfers.length && <p className="py-6 text-center text-sm text-slate-400">No warehouse transfers yet</p>}
          {transfers.map((transfer) => (
            <div key={transfer.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="font-medium text-slate-900">{transfer.transferNumber} · {productName(transfer.productId)}</div>
                <div className="mt-1 text-xs text-slate-500">{locationName(transfer.sourceLocationId)} → {locationName(transfer.destinationLocationId)} · Qty {qty(transfer.quantity)} · <span className="font-semibold">{transfer.status.replace(/_/g, " ")}</span></div>
                {transfer.notes && <div className="mt-1 text-xs text-slate-500">{transfer.notes}</div>}
              </div>
              <div className="flex flex-wrap gap-2">
                {transfer.status === "draft" && <Button size="sm" onClick={() => run(() => warehouseStore.approveWarehouseTransfer(transfer.id), "Transfer approved")}>Approve</Button>}
                {transfer.status === "approved" && <Button size="sm" onClick={() => run(() => warehouseStore.dispatchWarehouseTransfer(transfer.id), "Transfer dispatched")}>Dispatch</Button>}
                {transfer.status === "in_transit" && <Button size="sm" onClick={() => run(() => warehouseStore.receiveWarehouseTransfer(transfer.id), "Transfer received")}>Receive</Button>}
                {!["received", "cancelled"].includes(transfer.status) && <Button size="sm" variant="outline" onClick={() => run(() => warehouseStore.cancelWarehouseTransfer(transfer.id), "Transfer cancelled")}>Cancel</Button>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
