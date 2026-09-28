"use client";

import { Button } from "@minarvabiz/ui";
import type { AdminIdentityView } from "./types";

export function AdminHeader({
  identity,
  onSignOut,
}: {
  identity: AdminIdentityView;
  onSignOut: () => void | Promise<void>;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Minarva Biz — License Admin</h1>
        <p className="mt-1 text-sm text-slate-500">
          Signed in as <b>{identity.displayName}</b> · {identity.email} · role: <b>{identity.role}</b>
          {identity.source === "emergency" ? " · emergency session" : ""}
        </p>
      </div>
      <Button variant="outline" onClick={() => void onSignOut()}>Sign out</Button>
    </div>
  );
}
