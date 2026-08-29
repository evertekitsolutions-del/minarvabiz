"use client";

import * as React from "react";
import type { Branch } from "@minarvabiz/types";
import { Button } from "../Button";
import { Card, CardContent } from "../Card";
import { Modal } from "../forms/Modal";
import { FormField, inputClass } from "../forms/FormField";

export function BranchPanel({
  branches,
  activeBranchId,
  canAdd,
  limitMessage,
  onSelect,
  onAdd,
}: {
  branches: Branch[];
  activeBranchId?: string | null;
  canAdd: boolean;
  limitMessage?: string | null;
  onSelect: (id: string) => void;
  onAdd: (data: { name: string; code: string }) => { ok: boolean; error?: string };
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Branches</h3>
          <p className="text-sm text-slate-500">Multi-branch requires Enterprise</p>
        </div>
        <Button disabled={!canAdd} onClick={() => setOpen(true)}>+ Add branch</Button>
      </div>
      {limitMessage && (
        <p className="text-sm text-amber-700">{limitMessage}</p>
      )}
      <div className="space-y-2">
        {branches.map((b) => (
          <Card key={b.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <div className="font-medium text-slate-900">
                  {b.name}
                  {b.isHeadquarters && (
                    <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                      HQ
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500">{b.code || "—"} · {b.address || "No address"}</div>
              </div>
              {activeBranchId === b.id ? (
                <span className="text-sm font-medium text-emerald-600">Active</span>
              ) : (
                <Button size="sm" variant="outline" onClick={() => onSelect(b.id)}>
                  Switch
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Modal
        open={open}
        title="Add branch"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const r = onAdd({ name, code });
                if (!r.ok) {
                  setError(r.error || "Failed");
                  return;
                }
                setOpen(false);
                setName("");
                setCode("");
                setError(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Name *">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Code">
            <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} />
          </FormField>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
