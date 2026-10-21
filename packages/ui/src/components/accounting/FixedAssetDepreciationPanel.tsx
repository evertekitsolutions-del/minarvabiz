"use client";

import * as React from "react";
import {
  buildAssetDepreciationSchedule,
  type AssetDepreciationSchedule,
} from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { FormField, inputClass } from "../forms/FormField";
import { formatMoney } from "../customers/format";

/**
 * Planning-only bookkeeping preview; no persisted asset, journal entry,
 * depreciation posting or tax-rate calculation.
 */
export function FixedAssetDepreciationPanel() {
  const [assetReference, setAssetReference] = React.useState("");
  const [assetName, setAssetName] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [cost, setCost] = React.useState("");
  const [residual, setResidual] = React.useState("0");
  const [months, setMonths] = React.useState("36");
  const [preview, setPreview] = React.useState<AssetDepreciationSchedule | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function invalidate() { setPreview(null); setError(null); }
  function calculate() {
    setPreview(null);
    setError(null);
    try {
      setPreview(buildAssetDepreciationSchedule({
        assetReference, assetName, depreciationStartDate: startDate,
        acquisitionCost: cost, residualValue: residual, usefulLifeMonths: Number(months),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to calculate depreciation");
    }
  }

  function downloadCsv() {
    if (!preview) return;
    setError(null);
    try {
      const url = URL.createObjectURL(new Blob(["\uFEFF", preview.csv], {
        type: "text/csv;charset=utf-8",
      }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "minarvabiz-fixed-asset-" + preview.periods[0].postingDate + ".csv";
      document.body.appendChild(link);
      try { link.click(); }
      finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Depreciation CSV export failed");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fixed Asset Depreciation Planner</CardTitle>
        <p className="text-xs text-slate-600">
          Straight-line monthly book depreciation: first full charge at month-end
          of the start date. Preview only — no asset is saved and no expense,
          journal entry or tax depreciation is posted.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Asset reference">
            <input aria-label="Fixed asset reference" className={inputClass} value={assetReference}
              maxLength={128} placeholder="FA-2026-001"
              onChange={e => { setAssetReference(e.target.value); invalidate(); }} />
          </FormField>
          <FormField label="Asset name">
            <input aria-label="Fixed asset name" className={inputClass} value={assetName}
              maxLength={256} placeholder="Laptop / CCTV vehicle / workshop tools"
              onChange={e => { setAssetName(e.target.value); invalidate(); }} />
          </FormField>
          <FormField label="Depreciation start date">
            <input aria-label="Depreciation start date" type="date" className={inputClass}
              value={startDate} onChange={e => { setStartDate(e.target.value); invalidate(); }} />
          </FormField>
          <FormField label="Acquisition cost">
            <input aria-label="Asset acquisition cost" className={inputClass}
              type="text" inputMode="decimal" placeholder="100000.00"
              value={cost} onChange={e => { setCost(e.target.value); invalidate(); }} />
          </FormField>
          <FormField label="Residual / salvage value">
            <input aria-label="Asset residual value" className={inputClass}
              type="text" inputMode="decimal" value={residual}
              onChange={e => { setResidual(e.target.value); invalidate(); }} />
          </FormField>
          <FormField label="Useful life in months (1–360)">
            <input aria-label="Useful life months" type="number" min={1} max={360} step={1}
              className={inputClass} value={months}
              onChange={e => { setMonths(e.target.value); invalidate(); }} />
          </FormField>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={calculate}>Preview depreciation</Button>
          {preview && <Button size="sm" variant="outline" onClick={downloadCsv}>Export depreciation CSV</Button>}
        </div>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        {preview && (
          <div className="space-y-3">
            <p role="status" className="text-sm font-medium text-slate-800">
              {preview.assetReference} · {preview.usefulLifeMonths} months ·
              Total depreciation {formatMoney(preview.totalDepreciation)} ·
              Residual {formatMoney(preview.residual)}
            </p>
            <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-[720px] w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs text-slate-600">
                  <tr><th className="p-2">Month</th><th className="p-2">Period end</th>
                    <th className="p-2 text-right">Opening value</th>
                    <th className="p-2 text-right">Depreciation</th>
                    <th className="p-2 text-right">Accumulated</th>
                    <th className="p-2 text-right">Closing value</th></tr>
                </thead>
                <tbody>
                  {preview.periods.map(period => (
                    <tr key={period.month} className="border-t border-slate-100">
                      <td className="p-2">{period.month}</td>
                      <td className="p-2">{period.postingDate}</td>
                      <td className="p-2 text-right">{formatMoney(period.openingBookValue)}</td>
                      <td className="p-2 text-right">{formatMoney(period.expense)}</td>
                      <td className="p-2 text-right">{formatMoney(period.accumulatedDepreciation)}</td>
                      <td className="p-2 text-right">{formatMoney(period.closingBookValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
