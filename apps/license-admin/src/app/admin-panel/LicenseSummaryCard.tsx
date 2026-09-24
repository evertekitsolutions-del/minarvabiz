import { Card, CardContent, CardHeader, CardTitle } from "@minarvabiz/ui";
import type { LicenseRegistryRow } from "./types";

export function LicenseSummaryCard({ licenses }: { licenses: LicenseRegistryRow[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">License summary</CardTitle></CardHeader>
      <CardContent className="text-sm text-slate-600">
        <div>Total licenses: <b>{licenses.length}</b></div>
        <div className="mt-2">Active: <b>{licenses.filter((item) => item.status === "active").length}</b></div>
        <div>Suspended: <b>{licenses.filter((item) => item.status === "suspended").length}</b></div>
        <div>Revoked: <b>{licenses.filter((item) => item.status === "revoked").length}</b></div>
        <p className="mt-4 text-xs text-slate-400">
          Private signing keys and Supabase secret keys remain server-side.
        </p>
      </CardContent>
    </Card>
  );
}
