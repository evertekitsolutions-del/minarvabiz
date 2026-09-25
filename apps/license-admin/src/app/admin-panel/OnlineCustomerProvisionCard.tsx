"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@minarvabiz/ui";

interface OnlineCustomerProvisionCardProps {
  shopName: string;
  adminName: string;
  adminEmail: string;
  busy: boolean;
  canProvision: boolean;
  message: string | null;
  onShopNameChange: (value: string) => void;
  onAdminNameChange: (value: string) => void;
  onAdminEmailChange: (value: string) => void;
  onProvision: () => void;
}

export function OnlineCustomerProvisionCard(props: OnlineCustomerProvisionCardProps) {
  const {
    shopName,
    adminName,
    adminEmail,
    busy,
    canProvision,
    message,
    onShopNameChange,
    onAdminNameChange,
    onAdminEmailChange,
    onProvision,
  } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Create online customer</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-slate-500">
          Creates a new isolated organization, first admin account and Main Branch, then emails the
          customer a secure password-setup invitation.
        </p>
        <input
          className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
          placeholder="Shop / organization name"
          value={shopName}
          onChange={(event) => onShopNameChange(event.target.value)}
        />
        <input
          className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
          placeholder="Administrator full name"
          value={adminName}
          onChange={(event) => onAdminNameChange(event.target.value)}
        />
        <input
          type="email"
          className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
          placeholder="Administrator email"
          value={adminEmail}
          onChange={(event) => onAdminEmailChange(event.target.value)}
        />
        {message && <p className="text-sm text-slate-700">{message}</p>}
        {!canProvision && (
          <p className="text-xs text-amber-600">Your role cannot provision online customers.</p>
        )}
        <Button
          disabled={busy || !canProvision || !shopName.trim() || !adminName.trim() || !adminEmail.trim()}
          onClick={onProvision}
        >
          {busy ? "Creating…" : "Create & Send Invite"}
        </Button>
      </CardContent>
    </Card>
  );
}
