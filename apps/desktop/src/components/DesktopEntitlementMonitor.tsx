import * as React from "react";
import type { TrialState } from "@minarvabiz/ui";
import type { DesktopCommercialLicenseState } from "./DesktopLicenseView";

export function DesktopEntitlementMonitor({
  enabled,
  onTrialStateChange,
  onLicenseStateChange,
}: {
  enabled: boolean;
  onTrialStateChange: (state: TrialState) => void;
  onLicenseStateChange: (state: DesktopCommercialLicenseState) => void;
}) {
  React.useEffect(() => {
    if (!enabled || !window.minarvaDesktop) return;

    let cancelled = false;
    let running = false;
    const refresh = async () => {
      if (running || !window.minarvaDesktop) return;
      running = true;
      try {
        const [trial, license] = await Promise.all([
          window.minarvaDesktop.getTrialState(),
          window.minarvaDesktop.getLicenseState(),
        ]);
        if (!cancelled) {
          onTrialStateChange(trial);
          onLicenseStateChange(license as DesktopCommercialLicenseState);
        }
      } finally {
        running = false;
      }
    };

    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(() => void refresh(), 60_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, onLicenseStateChange, onTrialStateChange]);

  return null;
}
