"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@minarvabiz/ui";
import {
  activeActivationCount,
  customerNameForLicense,
  enabledFeatureLabels,
} from "./model";
import type { LicenseRegistryRow, LicenseStatusAction } from "./types";

interface LicenseRegistryCardProps {
  licenses: LicenseRegistryRow[];
  busy: boolean;
  canManageStatus: boolean;
  onStatusChange: (licenseId: string, status: LicenseStatusAction) => void;
}

export function LicenseRegistryCard(props: LicenseRegistryCardProps) {
  const { licenses, busy, canManageStatus, onStatusChange } = props;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">License registry</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {licenses.length === 0 && (
          <p className="text-sm text-slate-400">No commercial licenses issued yet.</p>
        )}
        {licenses.map((item) => {
          const enabled = enabledFeatureLabels(item).join(", ");
          return (
            <div
              key={item.license_id}
              className="rounded-lg border border-slate-100 bg-white px-3 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-slate-900">{customerNameForLicense(item)}</div>
                  <div className="text-xs text-slate-500">
                    {item.license_id} · {item.plan} · {item.edition} · {item.status}
                  </div>
                  <div className="text-xs text-slate-400">
                    PCs: {activeActivationCount(item)}/{item.activation_limit} · Expires:{" "}
                    {item.expires_at ? new Date(item.expires_at).toLocaleString() : "Never"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !canManageStatus}
                    onClick={() => onStatusChange(item.license_id, "suspended")}
                  >
                    Suspend
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !canManageStatus}
                    onClick={() => onStatusChange(item.license_id, "revoked")}
                  >
                    Revoke
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy || !canManageStatus}
                    onClick={() => onStatusChange(item.license_id, "active")}
                  >
                    Activate
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                <b>Features:</b> {enabled || "None"}
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
