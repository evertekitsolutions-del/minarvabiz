"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@minarvabiz/ui";
import { POS_SHORTCUTS } from "@minarvabiz/business-logic";

export default function HelpPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Help & shortcuts</h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">POS keyboard shortcuts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {POS_SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex justify-between text-sm">
              <kbd className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs">{s.keys}</kbd>
              <span className="text-slate-600">{s.action}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <p className="text-sm text-slate-500">
        Minarva Biz — Boutique Billing & Management. Support: contact Evertek IT Solutions.
      </p>
    </div>
  );
}
