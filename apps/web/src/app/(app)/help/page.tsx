"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@minarvabiz/ui";
import { POS_SHORTCUTS } from "@minarvabiz/business-logic";

const workflows = [
  { title: "Set up products", href: "/inventory", detail: "Add products, verify prices and opening stock before the first sale." },
  { title: "Create a bill", href: "/sales", detail: "Open Sales, add products and confirm the payment before printing." },
  { title: "Record a purchase", href: "/purchases", detail: "Keep supplier purchases and received stock in sync." },
  { title: "Review balances", href: "/accounting", detail: "Review the ledger and verify payments before closing the day." },
  { title: "Protect your data", href: "/backup", detail: "Review backup and restore options and keep a verified copy." },
  { title: "Get support", href: "/support", detail: "Use the support screen for questions and troubleshooting." },
] as const;

export default function HelpPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Help & getting started</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Open a workflow below to get started. Features depend on your edition, permissions and connection.
        </p>
      </header>
      <section aria-labelledby="help-workflows">
        <h2 id="help-workflows" className="mb-3 text-lg font-semibold">Common tasks</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {workflows.map((workflow) => (
            <Link key={workflow.href} href={workflow.href} className="group block rounded-xl border border-slate-200 bg-white p-5 transition hover:border-indigo-300 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
              <h3 className="font-semibold text-slate-900 group-hover:text-indigo-700">{workflow.title} <span aria-hidden="true">→</span></h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{workflow.detail}</p>
            </Link>
          ))}
        </div>
      </section>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">POS keyboard shortcuts</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-slate-100">
            {POS_SHORTCUTS.map((shortcut) => (
              <div key={shortcut.keys} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <dt className="text-slate-600">{shortcut.action}</dt>
                <dd><kbd className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-800">{shortcut.keys}</kbd></dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <section aria-labelledby="help-troubleshooting" className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <h2 id="help-troubleshooting" className="text-base font-semibold text-slate-900">Troubleshooting</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          If a change has not synced, check your connection and sync status before editing the same record on another device.
          For missing records or unexpected totals, avoid repeated submissions and contact support with the relevant record number.
        </p>
        <Link href="/support" className="mt-3 inline-flex rounded text-sm font-semibold text-indigo-700 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600">Open support</Link>
      </section>
    </div>
  );
}
