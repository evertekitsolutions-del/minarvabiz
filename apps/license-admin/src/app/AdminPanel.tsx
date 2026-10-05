"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Edition, LicenseFeatures } from "@minarvabiz/types";
import type { LicensePlan } from "@minarvabiz/licensing";
import {
  createCommercialLicense,
  createOfflineActivationPackage,
  logoutEmergencyAdmin,
  setLicenseStatus,
} from "./actions";
import { AdminAuthCard } from "./admin-panel/AdminAuthCard";
import { AdminHeader } from "./admin-panel/AdminHeader";
import { LicenseCreateCard } from "./admin-panel/LicenseCreateCard";
import { LicenseRegistryCard } from "./admin-panel/LicenseRegistryCard";
import { LicenseSummaryCard } from "./admin-panel/LicenseSummaryCard";
import { OfflineActivationCard } from "./admin-panel/OfflineActivationCard";
import { OnlineCustomerProvisionCard } from "./admin-panel/OnlineCustomerProvisionCard";
import { SupportInboxSection } from "./admin-panel/SupportInboxSection";
import { useOnlineCustomerProvisioning } from "./admin-panel/useOnlineCustomerProvisioning";
import { useAdminAuthentication, type BrowserAdminDashboard } from "./admin-panel/useAdminAuthentication";
import {
  createBrowserOfflineActivation,
  issueBrowserLicense,
  loadBrowserAdminDashboard,
  setBrowserLicenseStatus,
  signOutBrowserAdmin,
} from "./admin-panel/browser-admin-api";
import { canIssueLicense, canManageLicenseStatus, defaultFeatures } from "./admin-panel/model";
import type {
  AdminIdentityView,
  LicenseRegistryRow,
  LicenseStatusAction,
  SupportRequestRow,
} from "./admin-panel/types";

interface AdminPanelProps {
  identity: AdminIdentityView | null;
  initialLicenses: LicenseRegistryRow[];
  initialSupportRequests: SupportRequestRow[];
}

export default function AdminPanel({
  identity,
  initialLicenses,
  initialSupportRequests,
}: AdminPanelProps) {
  const router = useRouter();
  const [activeIdentity, setActiveIdentity] = React.useState(identity);
  const [licenses, setLicenses] = React.useState(initialLicenses);
  const [supportRequests, setSupportRequests] = React.useState(initialSupportRequests);
  const [browserDirect, setBrowserDirect] = React.useState(false);
  const [customerName, setCustomerName] = React.useState("");
  const [plan, setPlan] = React.useState<LicensePlan>("professional");
  const [edition, setEdition] = React.useState<Edition>("hybrid");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [activationLimit, setActivationLimit] = React.useState("");
  const [features, setFeatures] = React.useState<LicenseFeatures>(() => defaultFeatures("professional"));
  const [offlineLicenseId, setOfflineLicenseId] = React.useState("");
  const [offlineDeviceId, setOfflineDeviceId] = React.useState("");
  const [lastToken, setLastToken] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const applyDashboard = React.useCallback((dashboard: BrowserAdminDashboard) => {
    setActiveIdentity(dashboard.identity);
    setLicenses(dashboard.licenses);
    setSupportRequests(dashboard.requests);
    setBrowserDirect(true);
  }, []);

  const auth = useAdminAuthentication(applyDashboard);
  const onlineProvisioning = useOnlineCustomerProvisioning(
    activeIdentity?.role || "viewer",
    browserDirect,
  );

  React.useEffect(() => setFeatures(defaultFeatures(plan)), [plan]);
  React.useEffect(() => {
    if (browserDirect) return;
    setActiveIdentity(identity);
    setLicenses(initialLicenses);
    setSupportRequests(initialSupportRequests);
  }, [browserDirect, identity, initialLicenses, initialSupportRequests]);

  React.useEffect(() => {
    let cancelled = false;
    void loadBrowserAdminDashboard().then((result) => {
      if (!cancelled && result.ok) applyDashboard(result);
    });
    return () => {
      cancelled = true;
    };
  }, [applyDashboard]);

  const refreshBrowserDashboard = React.useCallback(async () => {
    const result = await loadBrowserAdminDashboard();
    if (!result.ok) {
      setMessage(result.error);
      return false;
    }
    applyDashboard(result);
    return true;
  }, [applyDashboard]);

  async function refreshAfterMutation() {
    if (browserDirect) await refreshBrowserDashboard();
    else router.refresh();
  }

  async function issue() {
    if (!customerName.trim()) {
      setMessage("Enter a customer name.");
      return;
    }
    const input = {
      customerName,
      plan,
      edition,
      expiresAt: expiresAt || null,
      activationLimit: activationLimit ? Number(activationLimit) : undefined,
      featureOverrides: features,
    };
    setBusy(true);
    setMessage(null);
    const result = browserDirect
      ? await issueBrowserLicense(input)
      : await createCommercialLicense(input);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error || "License issue failed.");
      return;
    }
    setLastToken(result.token || null);
    setCustomerName("");
    await refreshAfterMutation();
  }

  async function status(licenseId: string, value: LicenseStatusAction) {
    setBusy(true);
    setMessage(null);
    const result = browserDirect
      ? await setBrowserLicenseStatus(licenseId, value)
      : await setLicenseStatus(licenseId, value);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error || "Status update failed.");
      return;
    }
    await refreshAfterMutation();
  }

  async function createOfflinePackage() {
    if (!offlineLicenseId.trim() || !offlineDeviceId.trim()) {
      setMessage("Enter license ID and Windows device ID.");
      return;
    }
    const input = {
      licenseId: offlineLicenseId.trim(),
      deviceId: offlineDeviceId.trim(),
    };
    setBusy(true);
    setMessage(null);
    const result = browserDirect
      ? await createBrowserOfflineActivation(input)
      : await createOfflineActivationPackage(input);
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
      `Offline activation package created for activation ${result.activationId || ""}. Copy the .lic file to Windows.`,
    );
    await refreshAfterMutation();
  }

  async function signOut() {
    if (browserDirect) {
      await signOutBrowserAdmin();
      setBrowserDirect(false);
      setActiveIdentity(null);
      setLicenses([]);
      setSupportRequests([]);
      setLastToken(null);
      return;
    }

    await logoutEmergencyAdmin();
    router.refresh();
  }

  if (!activeIdentity) {
    return <AdminAuthCard {...auth} />;
  }

  const canIssue = canIssueLicense(activeIdentity.role);
  const canManageStatus = canManageLicenseStatus(activeIdentity.role);

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <AdminHeader identity={activeIdentity} onSignOut={() => void signOut()} />
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
          <LicenseSummaryCard licenses={licenses} />
        </div>
        <OfflineActivationCard
          licenseId={offlineLicenseId}
          deviceId={offlineDeviceId}
          busy={busy}
          canIssue={canIssue}
          onLicenseIdChange={setOfflineLicenseId}
          onDeviceIdChange={setOfflineDeviceId}
          onCreate={() => void createOfflinePackage()}
        />
        <SupportInboxSection
          role={activeIdentity.role}
          useBrowserApi={browserDirect}
          requests={supportRequests}
          onRefresh={async () => { await refreshBrowserDashboard(); }}
        />
        <LicenseRegistryCard
          licenses={licenses}
          busy={busy}
          canManageStatus={canManageStatus}
          onStatusChange={(licenseId, nextStatus) => void status(licenseId, nextStatus)}
        />
      </div>
    </main>
  );
}
