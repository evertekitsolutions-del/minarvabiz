"use client";

import * as React from "react";
import {
  beginBrowserFirstAdminSignup,
  getBrowserAdminBootstrapStatus,
  requestBrowserAdminPasswordSetup,
  resendBrowserFirstAdminConfirmation,
} from "./browser-admin-auth";

export function useFirstAdminBootstrap() {
  const [bootstrapAvailable, setBootstrapAvailable] = React.useState(false);
  const [bootstrapConfigured, setBootstrapConfigured] = React.useState(false);
  const [bootstrapBusy, setBootstrapBusy] = React.useState(false);
  const [bootstrapMessage, setBootstrapMessage] = React.useState<string | null>(null);
  const [bootstrapSent, setBootstrapSent] = React.useState(false);
  const [bootstrapEmail, setBootstrapEmail] = React.useState("");

  const refreshStatus = React.useCallback(async () => {
    const result = await getBrowserAdminBootstrapStatus();
    if (!result.ok) {
      setBootstrapAvailable(false);
      setBootstrapConfigured(false);
      setBootstrapMessage(result.error);
      return;
    }
    setBootstrapAvailable(result.required);
    setBootstrapConfigured(result.configured);
    if (result.required && !result.configured) {
      setBootstrapMessage("First-administrator setup is not configured on the Cloudflare authority.");
    } else if (!result.required) {
      setBootstrapMessage(null);
    }
  }, []);

  React.useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  async function run() {
    setBootstrapBusy(true);
    setBootstrapMessage(null);
    const result = await beginBrowserFirstAdminSignup(bootstrapEmail);
    setBootstrapBusy(false);
    if (!result.ok) {
      setBootstrapMessage(result.error || "Administrator setup failed.");
      if (result.code === "BOOTSTRAP_CLOSED") void refreshStatus();
      return;
    }
    setBootstrapSent(true);
    setBootstrapMessage(result.message);
  }

  async function resend() {
    setBootstrapBusy(true);
    setBootstrapMessage(null);
    const result = await resendBrowserFirstAdminConfirmation(bootstrapEmail);
    setBootstrapBusy(false);
    if (!result.ok) {
      setBootstrapMessage(result.error || "Confirmation email could not be resent.");
      if (result.code === "BOOTSTRAP_CLOSED") void refreshStatus();
      return;
    }
    setBootstrapMessage(result.message);
  }

  async function passwordSetup() {
    setBootstrapBusy(true);
    setBootstrapMessage(null);
    const result = await requestBrowserAdminPasswordSetup(bootstrapEmail);
    setBootstrapBusy(false);
    if (!result.ok) {
      setBootstrapMessage(result.error || "Password setup email could not be sent.");
      return;
    }
    setBootstrapMessage(result.message);
  }

  return {
    bootstrapAvailable,
    bootstrapConfigured,
    bootstrapBusy,
    bootstrapMessage,
    bootstrapSent,
    bootstrapEmail,
    onBootstrapEmailChange: setBootstrapEmail,
    onBootstrap: () => void run(),
    onResendBootstrapConfirmation: () => void resend(),
    onPasswordSetup: () => void passwordSetup(),
    onRefreshBootstrapStatus: () => void refreshStatus(),
  };
}
