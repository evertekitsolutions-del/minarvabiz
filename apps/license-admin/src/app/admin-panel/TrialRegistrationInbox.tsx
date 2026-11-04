"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@minarvabiz/ui";
import type { TrialRegistrationRow } from "./types";

export function TrialRegistrationInbox({ registrations, onSelectForConversion }: { registrations: TrialRegistrationRow[]; onSelectForConversion: (registration: TrialRegistrationRow) => void }) {
  return <Card>
    <CardHeader><CardTitle className="text-base">New 30-day trial registrations ({registrations.length})</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {registrations.length === 0 && <p className="text-sm text-slate-500">No trial registrations have been received.</p>}
      {registrations.map((item) => <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><h3 className="font-semibold text-slate-900">{item.organization_name}</h3><p className="text-sm text-slate-600">{item.email} · {item.phone}</p></div>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{item.status}</span>
        </div>
        <p className="mt-2 text-sm text-slate-600">{item.address}</p>
        <div className="mt-3"><button type="button" disabled={item.status === "converted" || item.status === "revoked"} onClick={() => onSelectForConversion(item)} className="rounded-lg border border-blue-600 px-3 py-2 text-sm font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-40">{item.status === "converted" ? "Paid license issued" : item.status === "revoked" ? "Trial revoked" : "Convert this customer to paid"}</button></div>
        <dl className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
          <div><dt>Registered</dt><dd>{new Date(item.created_at).toLocaleString()}</dd></div>
          <div><dt>Trial started</dt><dd>{new Date(item.trial_started_at).toLocaleString()}</dd></div>
          <div><dt>Trial expires</dt><dd>{new Date(item.trial_expires_at).toLocaleString()}</dd></div>
        </dl>
      </article>)}
    </CardContent>
  </Card>;
}
