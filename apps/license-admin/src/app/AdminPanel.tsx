"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@minarvabiz/ui";
import type { Edition, LicenseFeatures } from "@minarvabiz/types";
import type { LicensePlan } from "@minarvabiz/licensing";
import { adoptCloudflareAdminSession, createCommercialLicense, createOfflineActivationPackage, loginEmergencyAdmin, logoutAdmin,setLicenseStatus } from "./actions";
import { AdminAuthCard } from "./admin-panel/AdminAuthCard";
import { AdminHeader } from "./admin-panel/AdminHeader";
import { LicenseCreateCard } from "./admin-panel/LicenseCreateCard";
import { LicenseRegistryCard } from "./admin-panel/LicenseRegistryCard";
import { LicenseSummaryCard } from "./admin-panel/LicenseSummaryCard";
import { OfflineActivationCard } from "./admin-panel/OfflineActivationCard";
import { OnlineCustomerProvisionCard } from "./admin-panel/OnlineCustomerProvisionCard";
import { SupportInboxSection } from "./admin-panel/SupportInboxSection";
import { useOnlineCustomerProvisioning } from "./admin-panel/useOnlineCustomerProvisioning";
import { canIssueLicense, canManageLicenseStatus, defaultFeatures } from "./admin-panel/model";
import { beginBrowserAdminMfaEnrollment, beginBrowserNamedAdminLogin, verifyBrowserAdminMfa, type BrowserAdminPendingAuth } from "./admin-panel/browser-admin-auth";
import type { AdminIdentityView, AuthStage, LicenseRegistryRow, LicenseStatusAction, SupportRequestRow } from "./admin-panel/types";
interface AdminPanelProps { identity: AdminIdentityView | null; initialLicenses: LicenseRegistryRow[]; initialSupportRequests: SupportRequestRow[]; bootstrapAvailable: boolean; }
export default function AdminPanel({identity,initialLicenses,initialSupportRequests,bootstrapAvailable}: AdminPanelProps) {
  const router=useRouter();
  const [email,setEmail]=React.useState("");
  const [password,setPassword]=React.useState("");
  const [emergencyPassword,setEmergencyPassword]=React.useState("");
  const [authStage,setAuthStage]=React.useState<AuthStage>("password");
  const [mfaCode,setMfaCode]=React.useState("");
  const [mfaSecret,setMfaSecret]=React.useState("");
  const [mfaQrCode,setMfaQrCode]=React.useState("");
  const [pendingBrowserAuth,setPendingBrowserAuth]=React.useState<BrowserAdminPendingAuth | null>(null);
  const [customerName,setCustomerName]=React.useState("");
  const [plan,setPlan]=React.useState<LicensePlan>("professional");
  const [edition,setEdition]=React.useState<Edition>("hybrid");
  const [expiresAt,setExpiresAt]=React.useState("");
  const [activationLimit,setActivationLimit]=React.useState("");
  const [features,setFeatures]=React.useState<LicenseFeatures>(() => defaultFeatures("professional"));
  const [offlineLicenseId,setOfflineLicenseId]=React.useState("");
  const [offlineDeviceId,setOfflineDeviceId]=React.useState("");
  const [lastToken,setLastToken]=React.useState<string | null>(null);
  const [message,setMessage]=React.useState<string|null>(null);
  const [busy,setBusy]=React.useState(false);
  React.useEffect(() => setFeatures(defaultFeatures(plan)), [plan]);
  async function login() {
    setBusy(true);
    setMessage(null);
    const result = await beginBrowserNamedAdminLogin(email, password);
    setBusy(false);
    if (!result.ok) {
      setPendingBrowserAuth(null);
      setMessage(result.error || "Login");
      return;
    }
    setPendingBrowserAuth(result.pending);
    setPassword("");
    setMfaCode(""); setMfaSecret(""); setMfaQrCode("");
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
      setMessage(result.error || "MFA setup failed");
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
      setMessage(verified.error || "MFA failed.");
      return;
    }
    const adopted = await adoptCloudflareAdminSession(verified.accessToken);
    setBusy(false);
    if (!adopted.ok) {
      setMessage(adopted.error || "Admin session failed.");
      return;
    }
    setPendingBrowserAuth(null);
    setEmail("");
    setMfaCode(""); setMfaSecret(""); setMfaQrCode("");
    setAuthStage("password");
    router.refresh();
  }
  function resetMfa() {
    setPendingBrowserAuth(null);
    setAuthStage("password");
    setMfaCode(""); setMfaSecret(""); setMfaQrCode("");
    setMessage(null);
  }
  async function emergencyLogin() {
    setBusy(true);
    setMessage(null);
    const result = await loginEmergencyAdmin(emergencyPassword);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error || "Emergency failed.");
      return;
    }
    setEmergencyPassword("");
    router.refresh();
  }
  async function issue() {
    if (!customerName.trim()) {
      setMessage("Enter a customer name.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await createCommercialLicense({
      customerName,
      plan,
      edition,
      expiresAt: expiresAt || null,
      activationLimit: activationLimit ? Number(activationLimit) : undefined,
      featureOverrides: features,
    });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error || "License issue failed.");
      return;
    }
    setLastToken(result.token || null);
    setCustomerName("");
    router.refresh();
  }
  async function status(licenseId: string, value: LicenseStatusAction) {
    setBusy(true);
    setMessage(null);
    const result = await setLicenseStatus(licenseId, value);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error || "Status update failed");
      return;
    }
    router.refresh();
  }
  async function createOfflinePackage() {
    if (!offlineLicenseId.trim() || !offlineDeviceId.trim()) {
      setMessage("Enter license ID and Windows device ID.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await createOfflineActivationPackage({
      licenseId: offlineLicenseId.trim(),
      deviceId: offlineDeviceId.trim(),
    });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error || "Offline activation failed.");
      return;
    }
    const blob = new Blob([result.content || ""], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.filename || "MinarvaBiz.lic";
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(
      "Offline activation package created for activation " +
        result.activationId +
        ". Copy the .lic file to Windows.",
    );
    router.refresh();
  }
  if (!identity) {
    return (
      <AdminAuthCard
        authStage={authStage}
        email={email}
        password={password}
        emergencyPassword={emergencyPassword}
        mfaCode={mfaCode}
        mfaSecret={mfaSecret}
        mfaQrCode={mfaQrCode}
        message={message}
        busy={busy}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onEmergencyPasswordChange={setEmergencyPassword}
        onMfaCodeChange={setMfaCode}
        onLogin={() => void login()}
        onEmergencyLogin={() => void emergencyLogin()}
        onBeginMfaEnrollment={() => void beginMfaEnrollment()}
        onVerifyMfa={() => void verifyMfa()}
        onResetMfa={() => void resetMfa()}
        bootstrapAvailable={bootstrapAvailable}
      />
    );
  }
  const onlineProvisioning = useOnlineCustomerProvisioning(identity.role);
  const canIssue = canIssueLicense(identity.role);
  const canManageStatus = canManageLicenseStatus(identity.role);
  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <AdminHeader identity={identity} onSignOut={async()=>{await logoutAdmin();router.refresh();}} />
        <div className="grid gap-6 md:grid-cols-2">
          <OnlineCustomerProvisionCard {...onlineProvisioning} />
          <LicenseCreateCard
            customerName={customerName}
            plan={plan}
            edition={edition}
            expiresAt={expiresAt}
            activationLimit={activationLimit}
            features={features}
            message={message}
            lastToken={lastToken}
            busy={busy}
            canIssue={canIssue}
            onCustomerNameChange={setCustomerName}
            onPlanChange={setPlan}
            onEditionChange={setEdition}
            onExpiresAtChange={setExpiresAt}
            onActivationLimitChange={setActivationLimit}
            onFeatureChange={(key, value) =>
              setFeatures((current) => ({ ...current, [key]: value }))
            }
            onIssue={() => void issue()}
          />
          <LicenseSummaryCard licenses={initialLicenses} />
        </div>
        <OfflineActivationCard licenseId={offlineLicenseId} deviceId={offlineDeviceId} busy={busy} canIssue={canIssue} onLicenseIdChange={setOfflineLicenseId} onDeviceIdChange={setOfflineDeviceId} onCreate={()=>void createOfflinePackage()}/>
        <SupportInboxSection role={identity.role} requests={initialSupportRequests} />
        <LicenseRegistryCard
          licenses={initialLicenses}
          busy={busy}
          canManageStatus={canManageStatus}
          onStatusChange={(licenseId, nextStatus) => void status(licenseId, nextStatus)}
        />
      </div>
    </main>
  );
}
