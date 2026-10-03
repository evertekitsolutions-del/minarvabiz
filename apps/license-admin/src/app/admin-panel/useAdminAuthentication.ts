"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { loginEmergencyAdmin } from "../actions";
import {
  beginBrowserAdminMfaEnrollment,
  beginBrowserNamedAdminLogin,
  verifyBrowserAdminMfa,
  type BrowserAdminPendingAuth,
} from "./browser-admin-auth";
import {
  activateBrowserAdminSession,
  loadBrowserAdminDashboard,
} from "./browser-admin-api";
import type {
  AdminIdentityView,
  AuthStage,
  LicenseRegistryRow,
  SupportRequestRow,
} from "./types";

export interface NamedAdminDashboard {
  identity: AdminIdentityView;
  licenses: LicenseRegistryRow[];
  requests: SupportRequestRow[];
}

export function useAdminAuthentication(
  onNamedAuthenticated: (dashboard: NamedAdminDashboard) => void,
) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [emergencyPassword, setEmergencyPassword] = React.useState("");
  const [authStage, setAuthStage] = React.useState<AuthStage>("password");
  const [mfaCode, setMfaCode] = React.useState("");
  const [mfaSecret, setMfaSecret] = React.useState("");
  const [mfaQrCode, setMfaQrCode] = React.useState("");
  const [pendingBrowserAuth, setPendingBrowserAuth] =
    React.useState<BrowserAdminPendingAuth | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const clearMfa = React.useCallback(() => {
    setMfaCode("");
    setMfaSecret("");
    setMfaQrCode("");
  }, []);

  async function login() {
    setBusy(true);
    setMessage(null);
    const result = await beginBrowserNamedAdminLogin(email, password);
    setBusy(false);
    if (!result.ok) {
      setPendingBrowserAuth(null);
      setMessage(result.error || "Login failed.");
      return;
    }

    setPendingBrowserAuth(result.pending);
    setPassword("");
    clearMfa();
    if (result.next === "enroll") {
      setAuthStage("enroll");
      setMessage("Set up authenticator.");
      return;
    }
    setAuthStage("mfa");
    setMessage("Enter MFA code.");
  }

  async function beginMfaEnrollment() {
    setBusy(true);
    setMessage(null);
    const result = await beginBrowserAdminMfaEnrollment(pendingBrowserAuth);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error || "MFA setup failed.");
      return;
    }

    setPendingBrowserAuth(result.pending);
    setMfaSecret(result.secret || "");
    setMfaQrCode(result.qrCode || "");
    setAuthStage("mfa");
    setMessage("Authenticator ready. Enter the current code.");
  }

  async function verifyMfa() {
    setBusy(true);
    setMessage(null);
    const verified = await verifyBrowserAdminMfa(pendingBrowserAuth, mfaCode);
    if (!verified.ok) {
      setBusy(false);
      setMessage(verified.error || "MFA verification failed.");
      return;
    }

    if (!activateBrowserAdminSession(verified.accessToken, pendingBrowserAuth)) {
      setBusy(false);
      setMessage("Administrator browser session could not be stored.");
      return;
    }

    const dashboard = await loadBrowserAdminDashboard();
    setBusy(false);
    if (!dashboard.ok) {
      setMessage(dashboard.error);
      return;
    }

    setPendingBrowserAuth(null);
    setEmail("");
    setPassword("");
    clearMfa();
    setAuthStage("password");
    setMessage(null);
    onNamedAuthenticated(dashboard);
  }

  function resetMfa() {
    setPendingBrowserAuth(null);
    setAuthStage("password");
    clearMfa();
    setMessage(null);
  }

  async function emergencyLogin() {
    setBusy(true);
    setMessage(null);
    const result = await loginEmergencyAdmin(emergencyPassword);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error || "Emergency login failed.");
      return;
    }
    setEmergencyPassword("");
    router.refresh();
  }

  return {
    authStage,
    email,
    password,
    emergencyPassword,
    mfaCode,
    mfaSecret,
    mfaQrCode,
    message,
    busy,
    onEmailChange: setEmail,
    onPasswordChange: setPassword,
    onEmergencyPasswordChange: setEmergencyPassword,
    onMfaCodeChange: setMfaCode,
    onLogin: () => void login(),
    onEmergencyLogin: () => void emergencyLogin(),
    onBeginMfaEnrollment: () => void beginMfaEnrollment(),
    onVerifyMfa: () => void verifyMfa(),
    onResetMfa: resetMfa,
  };
}
