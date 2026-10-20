import * as React from "react";
import { Button, FormField, inputClass, Modal, SupplierList } from "@minarvabiz/ui";
import { can, phase5Store, setOpeningSupplierBalance } from "@minarvabiz/business-logic";
import type { Supplier } from "@minarvabiz/types";

/** Uses the existing audited opening-payable delta poster; never creates a payment. */
export function DesktopSupplierOpeningBalancePanel({
  onPersist,
  onAdd,
}: {
  onPersist: () => void | Promise<void>;
  onAdd: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [revision, setRevision] = React.useState(0);
  const [openingBalanceTarget, setOpeningBalanceTarget] = React.useState<Supplier | null>(null);
  const [openingBalanceAmount, setOpeningBalanceAmount] = React.useState("");
  const [openingBalanceError, setOpeningBalanceError] = React.useState<string | null>(null);
  void revision;
  const suppliers = phase5Store.listSuppliers(query);

  function openOpeningBalance(supplier: Supplier) {
    if (!can("settings.manage")) return;
    setOpeningBalanceTarget({ ...supplier });
    setOpeningBalanceAmount(String(supplier.outstandingBalance ?? 0));
    setOpeningBalanceError(null);
  }

  async function saveOpeningBalance() {
    if (!openingBalanceTarget) return;
    setOpeningBalanceError(null);
    try {
      if (!can("settings.manage")) throw new Error("Permission denied");
      if (!openingBalanceAmount.trim()) throw new Error("Enter an opening payable amount");
      const liveSupplier = phase5Store.getSupplier(openingBalanceTarget.id);
      if (!liveSupplier) throw new Error("Supplier no longer exists");
      const openedCents = Math.round(Number(openingBalanceTarget.outstandingBalance) * 100);
      const liveCents = Math.round(Number(liveSupplier.outstandingBalance) * 100);
      if (!Number.isSafeInteger(openedCents) || !Number.isSafeInteger(liveCents) ||
          openedCents !== liveCents) {
        throw new Error("Supplier payable changed. Close and reopen to review the new amount.");
      }
      const result = setOpeningSupplierBalance(liveSupplier.id, Number(openingBalanceAmount));
      if (!result.ok) throw new Error(result.error || "Opening payable was not saved");
      await onPersist();
      setOpeningBalanceTarget(null);
      setOpeningBalanceError(null);
      setRevision(value => value + 1);
    } catch (error) {
      setOpeningBalanceError(error instanceof Error ? error.message : "Unable to save opening payable");
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 p-3">
      <SupplierList
        suppliers={suppliers}
        onAdd={onAdd}
        onSearch={setQuery}
        onSetOpeningBalance={can("settings.manage") ? openOpeningBalance : undefined}
      />
      <Modal
        open={Boolean(openingBalanceTarget)}
        title="Set Supplier Opening Payable"
        onClose={() => { setOpeningBalanceTarget(null); setOpeningBalanceError(null); }}
        footer={<>
          <Button variant="outline" onClick={() => { setOpeningBalanceTarget(null); setOpeningBalanceError(null); }}>Cancel</Button>
          <Button disabled={!openingBalanceAmount.trim()} onClick={() => void saveOpeningBalance()}>Save opening payable</Button>
        </>}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Set the verified total current payable for {openingBalanceTarget?.name}.
            The difference posts to Accounts Payable and Opening Balance Equity,
            with an audit record. This is not a supplier payment.
          </p>
          <p className="text-sm text-slate-700">
            Current outstanding: <strong>{String(openingBalanceTarget?.outstandingBalance ?? 0)}</strong>.
            Check existing purchases and payments before changing this value.
          </p>
          <FormField label="Total opening payable">
            <input className={inputClass} type="number" min="0" step="0.01"
              value={openingBalanceAmount} onChange={event => setOpeningBalanceAmount(event.target.value)} />
          </FormField>
          {openingBalanceError && <p role="alert" className="text-sm text-rose-600">{openingBalanceError}</p>}
        </div>
      </Modal>
    </section>
  );
}
