"use client";

import * as React from "react";
import { bootstrapFirstLicenseAdmin } from "../actions";

export function useFirstAdminBootstrap() {
  const [bootstrapBusy, setBootstrapBusy] = React.useState(false);
  const [bootstrapMessage, setBootstrapMessage] = React.useState<string | null>(null);
  const [bootstrapSent, setBootstrapSent] = React.useState(false);

  async function run() {
    setBootstrapBusy(true);
    setBootstrapMessage(null);
    const result = await bootstrapFirstLicenseAdmin();
    setBootstrapBusy(false);
    if (!result.ok) {
      setBootstrapMessage(result.error || "Administrator setup failed.");
      return;
    }
    setBootstrapSent(true);
    setBootstrapMessage(result.message || "Administrator setup email sent.");
  }

  return {
    bootstrapBusy,
    bootstrapMessage,
    bootstrapSent,
    onBootstrap: () => void run(),
  };
}
