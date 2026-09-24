"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@minarvabiz/ui";

interface OfflineActivationCardProps {
  licenseId: string;
  deviceId: string;
  busy: boolean;
  canIssue: boolean;
  onLicenseIdChange: (value: string) => void;
  onDeviceIdChange: (value: string) => void;
  onCreate: () => void;
}

export function OfflineActivationCard(props: OfflineActivationCardProps) {
  const {
    licenseId,
    deviceId,
    busy,
    canIssue,
    onLicenseIdChange,
    onDeviceIdChange,
    onCreate,
  } = props;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Offline activation</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-500">
          For a Windows PC without internet: enter the license ID and the PC&apos;s
          64-character device ID, then download the signed .lic package.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-mono"
            placeholder="License ID"
            value={licenseId}
            onChange={(event) => onLicenseIdChange(event.target.value)}
          />
          <input
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-mono"
            placeholder="Target device ID (64 hex chars)"
            value={deviceId}
            onChange={(event) => onDeviceIdChange(event.target.value)}
          />
        </div>
        {!canIssue && (
          <p className="text-xs text-amber-600">
            Operator or admin role is required for offline activation.
          </p>
        )}
        <Button disabled={busy || !canIssue} onClick={onCreate}>
          {busy ? "Creating…" : "Create & download .lic"}
        </Button>
      </CardContent>
    </Card>
  );
}
