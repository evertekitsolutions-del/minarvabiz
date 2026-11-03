import * as React from "react";

type UpdateState = {
  status: "checking" | "disabled" | "up_to_date" | "available" | "error";
  version?: string;
  notes?: string;
  error?: string;
};

export function DesktopUpdateNotice() {
  const [state, setState] = React.useState<UpdateState>({ status: "checking" });
  const [busy, setBusy] = React.useState(false);
  const [dismissedVersion, setDismissedVersion] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState("");

  const check = React.useCallback(async () => {
    const api = window.minarvaDesktop;
    if (!api || busy) return;
    setState((current) => current.status === "available" ? current : { status: "checking" });
    try {
      const result = await api.checkForUpdates();
      setState({
        status: result.status,
        version: result.version,
        notes: result.notes,
        error: result.error,
      });
    } catch {
      setState({ status: "error", error: "Could not check for updates. Try again later." });
    }
  }, [busy]);

  React.useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), 6 * 60 * 60 * 1000);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [check]);

  async function install() {
    const api = window.minarvaDesktop;
    if (!api || busy) return;
    setBusy(true);
    setMessage("Downloading and verifying update…");
    try {
      const downloaded = await api.downloadUpdate();
      if (!downloaded.ok) {
        setMessage(downloaded.error || "Update download failed.");
        return;
      }
      setMessage("Update verified. Preparing a database backup and installing…");
      const installed = await api.installUpdate();
      if (!installed.ok) {
        setMessage(installed.error || "Update installation failed.");
        return;
      }
      setMessage("Update installer started. Minarva Biz will restart.");
    } catch {
      setMessage("Update failed. Your current installation has not been replaced.");
    } finally {
      setBusy(false);
    }
  }

  if (state.status === "disabled" || state.status === "up_to_date" || state.status === "checking") return null;
  if (state.status === "error") {
    return (
      <div role="status" className="fixed bottom-4 right-4 z-[100] max-w-sm rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-xl">
        <div className="font-semibold text-slate-900">Update check unavailable</div>
        <p className="mt-1 text-slate-600">{state.error}</p>
        <button className="mt-3 rounded-lg border px-3 py-2 font-medium" onClick={() => void check()}>Try again</button>
      </div>
    );
  }
  if (dismissedVersion === state.version) return null;

  return (
    <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-[100] w-[min(420px,calc(100vw-2rem))] rounded-xl border border-blue-200 bg-white p-4 shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-900">Minarva Biz update available</div>
          <div className="mt-1 text-sm text-slate-600">Version {state.version} is ready to install.</div>
        </div>
        <button aria-label="Remind me later" className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100" onClick={() => setDismissedVersion(state.version || null)}>Later</button>
      </div>
      {state.notes && <p className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap text-sm text-slate-600">{state.notes}</p>}
      {message && <p className="mt-3 text-sm text-slate-700">{message}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button disabled={busy} onClick={() => void install()} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Updating…" : "Update now"}
        </button>
        <button disabled={busy} onClick={() => void check()} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">Check again</button>
      </div>
    </div>
  );
}
