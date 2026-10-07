"use client";

import * as React from "react";
import {
  beginBrowserAdminMfaEnrollment,
  beginBrowserNamedAdminLogin,
  requestBrowserAdminPasswordSetup,
  claimBrowserFirstAdmin,
  getBrowserAdminBootstrapStatus,
  getBrowserAdminIdentity,
  verifyBrowserAdminMfa,
  type BrowserAdminPendingAuth,
} from "./browser-admin-auth";
import { beginBrowserEmergencyLogin } from "./browser-emergency-auth";
import {
  activateBrowserAdminSession,
  activateBrowserEmergencySession,
  loadBrowserAdminDashboard,
  signOutBrowserAdmin,
} from "./browser-admin-api";
import type {
  AdminIdentityView,
  AuthStage,
  LicenseRegistryRow,
  SupportRequestRow,
} from "./types";

export interface BrowserAdminDashboard {
  identity: AdminIdentityView;
  licenses: LicenseRegistryRow[];
  requests: SupportRequestRow[];
}

export function useAdminAuthentication(
  onAuthenticated: (dashboard: BrowserAdminDashboard) => void,
) {
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

  async function recoverPassword() {
    setBusy(true);
    setMessage(null);
    const result = await requestBrowserAdminPasswordSetup(email);
    setBusy(false);
    setMessage(result.ok
      ? "If this administrator account exists, a secure password reset link has been sent."
      : result.error || "Unable to send password reset link.");
  }

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

    let authorized = await getBrowserAdminIdentity(verified.accessToken, verified.userId);
    if (!authorized.ok) {
      const bootstrap = await getBrowserAdminBootstrapStatus();
      if (bootstrap.ok && bootstrap.required && bootstrap.configured) {
        const claimed = await claimBrowserFirstAdmin(verified.accessToken, verified.userId);
        if (!claimed.ok && claimed.code !== "BOOTSTRAP_CLOSED") {
          setBusy(false);
          setMessage(claimed.error);
          return;
        }
        authorized = claimed.ok
          ? { ok: true, identity: claimed.identity }
          : await getBrowserAdminIdentity(verified.accessToken, verified.userId);
      }
    }
    if (!authorized.ok) {
      setBusy(false);
      setMessage(authorized.error);
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
    onAuthenticated(dashboard);
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
    const result = await beginBrowserEmergencyLogin(emergencyPassword);
    if (!result.ok) {
      setBusy(false);
      setMessage(result.error || "Emergency login failed.");
      return;
    }

    if (!activateBrowserEmergencySession({
      sessionToken: result.sessionToken,
      identity: result.identity,
      expiresAt: result.expiresAt,
    })) {
      setBusy(false);
      setMessage("Emergency browser session could not be stored.");
      return;
    }

    const dashboard = await loadBrowserAdminDashboard();
    if (!dashboard.ok) {
      await signOutBrowserAdmin();
      setBusy(false);
      setMessage(dashboard.error);
      return;
    }

    setEmergencyPassword("");
    setPendingBrowserAuth(null);
    setEmail("");
    setPassword("");
    clearMfa();
    setAuthStage("password");
    setBusy(false);
    setMessage(null);
    onAuthenticated(dashboard);
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
    onRecoverPassword: () => void recoverPassword(),
    onEmergencyLogin: () => void emergencyLogin(),
    onBeginMfaEnrollment: () => void beginMfaEnrollment(),
    onVerifyMfa: () => void verifyMfa(),
    onResetMfa: resetMfa,
  };
}
