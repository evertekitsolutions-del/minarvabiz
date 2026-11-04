"use client";
import * as React from "react";
import type { LaundryOrder } from "@minarvabiz/types";
import {
  can, issueLaundryHandoverCode, listLaundryHandoverProofs,
  verifyLaundryHandoverCode, type LaundryHandoverLeg, type LaundryHandoverProof,
} from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { inputClass } from "../forms/FormField";

/** Manual in-person/phone confirmation; does not send OTP or automatically change ticket status. */
export function LaundryHandoverAction({ order, leg }: {
  order: LaundryOrder;
  leg: LaundryHandoverLeg;
}) {
  const [proof, setProof] = React.useState<LaundryHandoverProof | null>(
    () => listLaundryHandoverProofs(order.id).find(record => record.leg === leg) || null,
  );
  const [issued, setIssued] = React.useState<{code:string;expiresAt:string} | null>(null);
  const [entered, setEntered] = React.useState("");
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState("");
  const allowed = can("orders.manage");
  function start() {
    try {
      setIssued(issueLaundryHandoverCode(order.id, leg));
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to issue code"); }
  }
  function complete(event: React.FormEvent) {
    event.preventDefault();
    try {
      const result = verifyLaundryHandoverCode({
        orderId: order.id, leg, code: entered.trim(), acknowledgedBy: name,
      });
      setProof(result);
      setIssued(null);
      setEntered("");
      setName("");
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to verify code"); }
  }
  return <div className="mt-2 rounded-lg border border-slate-200 p-2">
    <div className="text-xs font-semibold">{order.orderNumber} · {leg === "pickup" ? "Pickup acknowledgment" : "Customer delivery acknowledgment"}</div>
    {proof ? <p className="mt-1 text-xs text-emerald-700" role="status">
      Verified by {proof.acknowledgedBy} · {new Date(proof.verifiedAt).toLocaleString()}
    </p> : !allowed ? <p className="text-xs text-slate-500">Orders permission required.</p> : <>
      <p className="my-1 text-xs text-slate-500">Local 6-digit code · no SMS/WhatsApp is sent. Share directly with the customer, then enter their confirmation. This does not close the laundry ticket.</p>
      {!issued ? <Button size="sm" variant="outline" onClick={start}>Generate customer confirmation code</Button> : <form onSubmit={complete} className="mt-2 space-y-2">
        <p className="text-xs">Customer code: <strong className="font-mono tracking-widest">{issued.code}</strong> · expires {new Date(issued.expiresAt).toLocaleTimeString()}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs">Confirmed by<input className={inputClass+" mt-1"} required maxLength={120}
            placeholder="Customer/recipient name" value={name} onChange={e=>setName(e.target.value)}/></label>
          <label className="text-xs">Code received<input className={inputClass+" mt-1"} inputMode="numeric" pattern="[0-9]{6}" required maxLength={6}
            autoComplete="one-time-code" placeholder="6-digit code" value={entered}
            onChange={e=>setEntered(e.target.value.replace(/\D/g,"").slice(0,6))}/></label>
        </div>
        <Button size="sm" type="submit" disabled={entered.length!==6 || name.trim().length<2}>Record customer acknowledgment</Button>
      </form>}
      {error && <p className="mt-1 text-xs text-rose-700" role="alert">{error}</p>}
    </>}
    <p className="mt-1 text-[11px] text-slate-500">Saved only in this device's encrypted/local backup workflow where configured; not a synced courier proof.</p>
  </div>;
}
