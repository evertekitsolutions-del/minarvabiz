"use client";

import * as React from "react";

export function SaaSPwaBoot() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production" ||
        !("serviceWorker" in navigator) || !window.isSecureContext) return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error: unknown) => {
      // Installation must not interrupt billing/login or claim offline availability.
      console.warn("[minarvabiz] Online PWA installation unavailable:", error);
    });
  }, []);
  return null;
}
