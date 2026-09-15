"use client";

import * as React from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  inputClass,
  ProductionBoard,
} from "@minarvabiz/ui";
import {
  store,
  ordersStore,
  phase6Store,
  phase10Store,
  canTransition,
  ORDER_STATUS_LABELS,
} from "@minarvabiz/business-logic";
import type { OrderStatus, ServiceOrder, Product } from "@minarvabiz/types";

export default function ProductionOperationsPage() {
  const [orders, setOrders] = React.useState<ServiceOrder[]>([]);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [staff, setStaff] = React.useState(() => phase6Store.listStaff({ status: "active" }));
  const [assignments, setAssignments] = React.useState(() => phase6Store.listAssignments());
  const [rolls, setRolls] = React.useState(() => phase10Store.listMaterialRolls());
  const [selectedMaterial, setSelectedMaterial] = React.useState("");
  const [batchId, setBatchId] = React.useState("");
  const [shadeCode, setShadeCode] = React.useState("");
  const [widthMeters, setWidthMeters] = React.useState("");
  const [quantityMeters, setQuantityMeters] = React.useState("");
  const [costPerMeter, setCostPerMeter] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    const nextOrders = ordersStore.listOrders().filter((order) => !order.deletedAt);
    setOrders(nextOrders);
    setProducts(store.listProducts());
    setStaff(phase6Store.listStaff({ status: "active" }));
    setAssignments(phase6Store.listAssignments());
    setRolls(phase10Store.listMaterialRolls());
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  function handleStatusChange(orderId: string, status: OrderStatus) {
    const current = ordersStore.getOrder(orderId);
    if (!current || current.status === status || !canTransition(current.status, status)) return;
    const result = ordersStore.updateOrderStatus(orderId, status);
    if (result.order) refresh();
  }

  function handleAssign(orderId: string, staffId: string) {
    const result = phase6Store.assignStaffToOrder({ staffId, orderId });
    if (result.errors.length) {
      setMessage(result.errors.join("; "));
      return;
    }
    setMessage(`Assigned ${result.assignment?.orderNumber ?? orderId}`);
    refresh();
  }

  function addRoll() {
    if (!selectedMaterial) {
      setMessage("Material is required");
      return;
    }
    const quantity = Number(quantityMeters);
    const cost = Number(costPerMeter);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(cost) || cost < 0) {
      setMessage("Enter a valid quantity and cost");
      return;
    }
    phase10Store.createMaterialRoll({
      materialId: selectedMaterial,
      batchId: batchId || null,
      shadeCode: shadeCode || null,
      widthMeters: widthMeters ? Number(widthMeters) : null,
      quantityMeters: quantity,
      costPerMeter: cost,
    });
    setQuantityMeters("");
    setCostPerMeter("");
    setBatchId("");
    setShadeCode("");
    setWidthMeters("");
    setMessage("Material roll added");
    refresh();
  }

  function useRoll(id: string) {
    const value = window.prompt("Meters to consume", "1");
    if (value === null) return;
    const meters = Number(value);
    if (!Number.isFinite(meters) || meters <= 0) return;
    try {
      const result = phase10Store.consumeMaterialFromRoll(id, meters);
      setMessage(result.shortage > 0 ? `Consumed ${result.consumption?.actualMeters ?? 0}m; shortage ${result.shortage}m` : "Material consumed");
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to consume material");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Production & Materials</h1>
          <p className="text-sm text-slate-500">Production ownership, delivery-risk tracking, and roll-level material control.</p>
        </div>
        <Button variant="outline" onClick={refresh}>Refresh</Button>
      </div>

      {message && <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">{message}</div>}

      <ProductionBoard
        orders={orders}
        staff={staff}
        assignments={assignments}
        onStatusChange={handleStatusChange}
        onAssignStaff={handleAssign}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader><CardTitle>Receive material roll</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <FormField label="Material / product">
              <select className={inputClass} value={selectedMaterial} onChange={(e) => setSelectedMaterial(e.target.value)}>
                <option value="">Select material</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` — ${product.sku}` : ""}</option>)}
              </select>
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Quantity (m)"><input className={inputClass} type="number" min="0" step="0.01" value={quantityMeters} onChange={(e) => setQuantityMeters(e.target.value)} /></FormField>
              <FormField label="Cost / m"><input className={inputClass} type="number" min="0" step="0.01" value={costPerMeter} onChange={(e) => setCostPerMeter(e.target.value)} /></FormField>
              <FormField label="Batch"><input className={inputClass} value={batchId} onChange={(e) => setBatchId(e.target.value)} /></FormField>
              <FormField label="Shade"><input className={inputClass} value={shadeCode} onChange={(e) => setShadeCode(e.target.value)} /></FormField>
              <FormField label="Width (m)"><input className={inputClass} type="number" min="0" step="0.01" value={widthMeters} onChange={(e) => setWidthMeters(e.target.value)} /></FormField>
            </div>
            <Button onClick={addRoll}>Add roll</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Active material rolls</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rolls.length === 0 && <p className="text-sm text-slate-500">No material rolls recorded.</p>}
              {rolls.map((roll) => {
                const product = products.find((item) => item.id === roll.materialId);
                const available = Math.max(0, roll.quantityMeters - roll.reservedMeters);
                return (
                  <div key={roll.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                    <div>
                      <div className="font-medium text-slate-900">{product?.name ?? roll.materialId}</div>
                      <div className="text-xs text-slate-500">{available.toFixed(2)}m available · {roll.costPerMeter.toFixed(2)}/m{roll.shadeCode ? ` · shade ${roll.shadeCode}` : ""}{roll.batchId ? ` · batch ${roll.batchId}` : ""}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => useRoll(roll.id)}>Consume</Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Production flow reference</CardTitle></CardHeader>
        <CardContent className="text-sm text-slate-600">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((status) => <span key={status} className="rounded-full bg-slate-100 px-2.5 py-1">{ORDER_STATUS_LABELS[status]}</span>)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
