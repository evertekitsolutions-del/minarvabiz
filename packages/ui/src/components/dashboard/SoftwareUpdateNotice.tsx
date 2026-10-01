"use client";

import * as React from "react";
import { Button } from "../Button";

type UpdateCheckResult = {
  status: "disabled" | "up_to_date" | "available" | "error";
  currentVersion: string;
  version?: string;
  publishedAt?: string;
  notes?: string;
  error?: string;
};

type DesktopUpdateApi = {
  checkForUpdates?: () => Promise<UpdateCheckResult>;
  downloadUpdate?: () => Promise<{ ok: boolean; version?: string; installerPath?: string; error?: string }>;
  installUpdate?: () => Promise<{ ok: boolean; version?: string; backupPath?: string; restartExpected?: boolean; error?: string }>;
};

type UpdatePhase = "hidden" | "available" | "downloading" | "installing" | "error";

function desktopUpdateApi(): DesktopUpdateApi | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { minarvaDesktop?: DesktopUpdateApi }).minarvaDesktop ?? null;
}

function releaseItems(notes?: string) {
  return String(notes || "")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*•]\s*/, ""))
    .filter(Boolean)
    .slice(0, 12);
}

function publishedLabel(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function SoftwareUpdateNotice() {
  const [phase, setPhase] = React.useState<UpdatePhase>("hidden");
  const [update, setUpdate] = React.useState<UpdateCheckResult | null>(null);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    const api = desktopUpdateApi();
    if (!api?.checkForUpdates) return;
    let cancelled = false;

    void api.checkForUpdates()
      .then((result) => {
        if (cancelled || result.status !== "available" || !result.version) return;
        const dismissKey = `minarvabiz.update.dismissed.${result.version}`;
        try {
          if (window.sessionStorage.getItem(dismissKey) === "1") return;
        } catch {
          // A storage failure must never block an update notification.
        }
        setUpdate(result);
        setMessage(result.notes ? "Review the changes below, then update when convenient." : "A newer Minarva Biz version is ready.");
        setPhase("available");
      })
      .catch(() => {
        // Startup update checks are intentionally silent on transient network failures.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    if (update?.version) {
      try {
        window.sessionStorage.setItem(`minarvabiz.update.dismissed.${update.version}`, "1");
      } catch {
        // Dismissal can remain in-memory if session storage is unavailable.
      }
    }
    setPhase("hidden");
  }

  async function updateAndRestart() {
    const api = desktopUpdateApi();
    if (!api?.downloadUpdate || !api?.installUpdate || !update?.version) return;

    setPhase("downloading");
    setMessage("Downloading and verifying the signed update…");
    try {
      const download = await api.downloadUpdate();
      if (!download.ok) {
        setPhase("error");
        setMessage(download.error || "Update download failed.");
        return;
      }

      setPhase("installing");
      setMessage("Creating a protected database backup. Minarva Biz will close, install silently and reopen automatically…");
      const install = await api.installUpdate();
      if (!install.ok) {
        setPhase("error");
        setMessage(install.error || "Update installation was blocked.");
        return;
      }
      setMessage(`Installing Minarva Biz ${install.version || download.version || update.version}. The app will reopen automatically.`);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  if (phase === "hidden" || !update?.version) return null;

  const items = releaseItems(update.notes);
  const busy = phase === "downloading" || phase === "installing";

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-violet-50 shadow-sm">
      <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
              Update available
            </span>
            <span className="text-xs font-medium text-slate-500">
              {update.currentVersion} → {update.version}
              {publishedLabel(update.publishedAt) ? ` · ${publishedLabel(update.publishedAt)}` : ""}
            </span>
          </div>

          <h2 className="mt-3 text-lg font-semibold text-slate-900">
            Minarva Biz {update.version} is ready
          </h2>
          <p className={`mt-1 text-sm ${phase === "error" ? "text-red-600" : "text-slate-600"}`}>
            {message}
          </p>

          {items.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">What&apos;s new</div>
              <ul className="mt-2 grid gap-2 text-sm leading-6 text-slate-700">
                {items.map((item, index) => (
                  <li key={`${index}-${item}`} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 lg:max-w-48 lg:flex-col">
          <Button onClick={() => void updateAndRestart()} disabled={busy}>
            {phase === "downloading"
              ? "Downloading…"
              : phase === "installing"
                ? "Installing…"
                : phase === "error"
                  ? "Retry update"
                  : "Update & restart"}
          </Button>
          {!busy && <Button variant="outline" onClick={dismiss}>Later</Button>}
          <p className="w-full text-[11px] leading-4 text-slate-500">
            Signed installer · verified backup · automatic restart
          </p>
        </div>
      </div>
    </section>
  );
}
