"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { updateSupportRequest } from "../actions";
import { updateBrowserSupportRequest } from "./browser-admin-api";
import { canManageSupport } from "./model";
import { SupportInboxCard } from "./SupportInboxCard";
import type { AdminRole, AdminSource, SupportRequestRow, SupportRequestStatus } from "./types";

export function SupportInboxSection({
  role,
  source,
  requests,
  onRefresh,
}: {
  role: AdminRole;
  source: AdminSource;
  requests: SupportRequestRow[];
  onRefresh?: () => Promise<void>;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  async function update(input: {
    id: string;
    status: SupportRequestStatus;
    assignedTo: string;
    adminNotes: string;
  }) {
    setBusy(true);
    setMessage(null);
    const result = source === "supabase"
      ? await updateBrowserSupportRequest(input)
      : await updateSupportRequest(input);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error || "Support request update failed");
      return;
    }
    setMessage("Support request updated.");
    if (source === "supabase" && onRefresh) await onRefresh();
    else router.refresh();
  }

  return (
    <div className="space-y-2">
      {message && (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          {message}
        </div>
      )}
      <SupportInboxCard
        requests={requests}
        busy={busy}
        canManage={canManageSupport(role)}
        onUpdate={(input) => void update(input)}
      />
    </div>
  );
}
