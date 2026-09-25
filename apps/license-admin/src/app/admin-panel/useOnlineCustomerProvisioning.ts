"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { provisionOnlineCustomer } from "../actions";
import { canProvisionOnlineCustomer } from "./model";
import type { AdminRole } from "./types";

export function useOnlineCustomerProvisioning(role: AdminRole) {
  const router = useRouter();
  const [shopName, setShopName] = React.useState("");
  const [adminName, setAdminName] = React.useState("");
  const [adminEmail, setAdminEmail] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function provision() {
    if (!shopName.trim() || !adminName.trim() || !adminEmail.trim()) {
      setMessage("Shop name, administrator name and email are required.");
      return;
    }

    setBusy(true);
    setMessage(null);
    const result = await provisionOnlineCustomer({ shopName, adminName, email: adminEmail });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error || "Online customer provisioning failed.");
      return;
    }

    setMessage(result.message || "Online customer created and invitation sent.");
    setShopName("");
    setAdminName("");
    setAdminEmail("");
    router.refresh();
  }

  return {
    shopName,
    adminName,
    adminEmail,
    busy,
    message,
    onShopNameChange: setShopName,
    onAdminNameChange: setAdminName,
    onAdminEmailChange: setAdminEmail,
    onProvision: () => void provision(),
    canProvision: canProvisionOnlineCustomer(role),
  };
}
