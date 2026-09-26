"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@minarvabiz/ui";
import type { AuthStage } from "./types";
import { useFirstAdminBootstrap } from "./useFirstAdminBootstrap";

interface AdminAuthCardProps {
  authStage: AuthStage;
  email: string;
  password: string;
  emergencyPassword: string;
  mfaCode: string;
  mfaSecret: string;
  mfaQrCode: string;
  message: string | null;
  busy: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onEmergencyPasswordChange: (value: string) => void;
  onMfaCodeChange: (value: string) => void;
  onLogin: () => void;
  onEmergencyLogin: () => void;
  onBeginMfaEnrollment: () => void;
  onVerifyMfa: () => void;
  onResetMfa: () => void;
  bootstrapAvailable: boolean;
}

export function AdminAuthCard(props: AdminAuthCardProps) {
  const {
    authStage,
    email,
    password,
    emergencyPassword,
    mfaCode,
    mfaSecret,
    mfaQrCode,
    message,
    busy,
    onEmailChange,
    onPasswordChange,
    onEmergencyPasswordChange,
    onMfaCodeChange,
    onLogin,
    onEmergencyLogin,
    onBeginMfaEnrollment,
    onVerifyMfa,
    onResetMfa,
    bootstrapAvailable,
  } = props;
  const { bootstrapBusy, bootstrapMessage, bootstrapSent, onBootstrap } = useFirstAdminBootstrap();

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <Card className="mx-auto mt-16 max-w-md">
        <CardHeader><CardTitle>Minarva Biz — License Admin</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {authStage === "password" && (
            <>
              <p className="text-sm text-slate-500">
                Sign in with your named administrator account. MFA is required for named administrators.
              </p>
              <input
                type="email"
                autoComplete="username"
                maxLength={254}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                placeholder="Administrator email"
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
              />
              <input
                type="password"
                autoComplete="current-password"
                maxLength={2048}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                placeholder="Password"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onLogin();
                }}
              />
              {message && <p className="text-sm text-rose-600">{message}</p>}
              {bootstrapAvailable && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                  <p className="text-xs text-slate-600">
                    No named administrator exists yet. Send a one-time setup email to the configured administrator.
                  </p>
                  {bootstrapMessage && <p className="mt-2 text-xs text-slate-700">{bootstrapMessage}</p>}
                  <Button
                    className="mt-3"
                    variant="outline"
                    disabled={bootstrapBusy || bootstrapSent}
                    onClick={onBootstrap}
                  >
                    {bootstrapBusy ? "Sending setup email…" : bootstrapSent ? "Setup email sent" : "Set up first administrator"}
                  </Button>
                </div>
              )}
              <Button disabled={busy || !email.trim() || !password} onClick={onLogin}>
                {busy ? "Signing in…" : "Sign in"}
              </Button>
              <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <summary className="cursor-pointer text-xs font-medium text-slate-600">
                  Emergency break-glass access
                </summary>
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-slate-500">
                    Shared-secret access is disabled by default, requires a named emergency actor,
                    and creates only a short revocable session.
                  </p>
                  <input
                    type="password"
                    autoComplete="off"
                    maxLength={2048}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    placeholder="Emergency admin credential"
                    value={emergencyPassword}
                    onChange={(event) => onEmergencyPasswordChange(event.target.value)}
                  />
                  <Button
                    variant="outline"
                    disabled={busy || !emergencyPassword}
                    onClick={onEmergencyLogin}
                  >
                    {busy ? "Checking…" : "Emergency sign in"}
                  </Button>
                </div>
              </details>
            </>
          )}

          {authStage === "enroll" && (
            <>
              <p className="text-sm font-medium text-slate-800">MFA is required.</p>
              <p className="text-sm text-slate-500">
                No verified authenticator is registered for this administrator. Set up a TOTP
                authenticator before continuing.
              </p>
              {message && <p className="text-sm text-rose-600">{message}</p>}
              <div className="flex gap-2">
                <Button disabled={busy} onClick={onBeginMfaEnrollment}>
                  {busy ? "Preparing…" : "Set up authenticator"}
                </Button>
                <Button variant="outline" disabled={busy} onClick={onResetMfa}>Cancel</Button>
              </div>
            </>
          )}

          {authStage === "mfa" && (
            <>
              <p className="text-sm font-medium text-slate-800">MFA is required.</p>
              <p className="text-sm text-slate-500">
                Enter the current time-based code from your authenticator app.
              </p>
              {mfaQrCode.startsWith("data:image/") && (
                <img
                  src={mfaQrCode}
                  alt="Authenticator enrollment QR code"
                  className="mx-auto max-h-56 max-w-56 rounded-lg border border-slate-200 bg-white p-2"
                />
              )}
              {mfaSecret && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Manual authenticator secret</p>
                  <code className="mt-1 block break-all text-xs text-slate-800">{mfaSecret}</code>
                </div>
              )}
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                placeholder="Authenticator code"
                value={mfaCode}
                onChange={(event) => onMfaCodeChange(event.target.value.replace(/\D/g, "").slice(0, 10))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && mfaCode.length >= 6) onVerifyMfa();
                }}
              />
              {message && <p className="text-sm text-rose-600">{message}</p>}
              <div className="flex gap-2">
                <Button disabled={busy || mfaCode.length < 6} onClick={onVerifyMfa}>
                  {busy ? "Verifying…" : "Verify & sign in"}
                </Button>
                <Button variant="outline" disabled={busy} onClick={onResetMfa}>Cancel</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
