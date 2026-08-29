"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@minarvabiz/ui";
import { getSystemHealth } from "@minarvabiz/business-logic";

export default function SystemPage() {
  const [health, setHealth] = React.useState(() => getSystemHealth());

  React.useEffect(() => {
    setHealth(getSystemHealth());
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">System status</h2>
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
