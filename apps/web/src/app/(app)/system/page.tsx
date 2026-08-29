"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@minarvabiz/ui";
import { getSystemHealth } from "@minarvabiz/business-logic";
import { getDataMode, hydrateStoresFromSupabase } from "@/lib/data-source";
import { isSupabaseConfigured } from "@minarvabiz/database";
import { Button } from "@minarvabiz/ui";

export default function SystemPage() {
  const [health, setHealth] = React.useState(() => getSystemHealth());
  const [mode, setMode] = React.useState("memory");
  const [syncMsg, setSyncMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    setHealth(getSystemHealth());
    setMode(getDataMode());
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">System status</h2>
      <p className="text-sm text-slate-500">
        Data mode: <strong>{mode}</strong> · Supabase configured:{" "}
        {isSupabaseConfigured() ? "yes" : "no"}
      </p>
      <Button
        variant="outline"
        onClick={async () => {
          const r = await hydrateStoresFromSupabase();
          setSyncMsg(r.message + (r.counts ? " " + JSON.stringify(r.counts) : ""));
          setMode(getDataMode());
          setHealth(getSystemHealth());
        }}
      >
        Re-hydrate from Supabase
      </Button>
      {syncMsg && <p className="text-sm text-slate-600">{syncMsg}</p>}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Health</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-auto rounded-lg bg-slate-50 p-4 text-xs text-slate-700">
            {JSON.stringify(health, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
