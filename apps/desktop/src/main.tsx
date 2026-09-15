import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

const allowedThemes = new Set(["light", "midnight", "ocean", "emerald", "violet"]);

function applySavedTheme() {
  try {
    const savedTheme = window.localStorage.getItem("minarvabiz.ui.theme");
    if (savedTheme && allowedThemes.has(savedTheme)) {
      document.documentElement.dataset.theme = savedTheme;
    }
  } catch {
    // Theme preference must never prevent the desktop renderer from starting.
  }
}

function showBootstrapError(error: unknown) {
  console.error("[minarvabiz] renderer-bootstrap-fatal", error);
  const message = error instanceof Error ? (error.stack || error.message) : String(error);
  document.documentElement.dataset.minarvaRendererError = "true";
  document.documentElement.dataset.minarvaRendererReady = "false";
  const status = document.getElementById("boot-status");
  if (status) status.textContent = "Minarva Biz could not start the desktop interface.";
  const root = document.getElementById("root");
  if (!root) return;
  const existing = document.getElementById("boot-error");
  const errorBox = existing || document.createElement("pre");
  errorBox.id = "boot-error";
  errorBox.className = "minarva-boot-error";
  errorBox.textContent = message;
  if (!existing) root.appendChild(errorBox);
}

class RendererErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[minarvabiz] renderer-fatal", error);
    document.documentElement.dataset.minarvaRendererError = "true";
    document.documentElement.dataset.minarvaRendererReady = "false";
  }

  render() {
    if (this.state.error) {
      const message = this.state.error.stack || this.state.error.message || String(this.state.error);
      return (
        <div style={{ minHeight: "100%", display: "grid", placeItems: "center", padding: 32, fontFamily: "system-ui", background: "#f8fafc", color: "#0f172a" }}>
          <div style={{ width: "min(720px, 100%)", padding: 32, border: "1px solid #fecdd3", borderRadius: 20, background: "white", boxShadow: "0 18px 50px rgba(15,23,42,.10)" }}>
            <h1 style={{ margin: 0, fontSize: 24 }}>Minarva Biz could not start</h1>
            <p style={{ color: "#475569" }}>A renderer error stopped the desktop interface.</p>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: 16, borderRadius: 12, background: "#fff1f2", color: "#9f1239", font: "13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace" }}>{message}</pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function RendererReadyMarker({ children }: { children: React.ReactNode }) {
  // Set readiness during render, after App has successfully evaluated. This lets
  // the Electron runtime distinguish a real application mount from loaded HTML.
  document.documentElement.dataset.minarvaRendererReady = "true";
  document.documentElement.dataset.minarvaRendererError = "false";
  return <>{children}</>;
}

async function boot() {
  applySavedTheme();
  const rootElement = document.getElementById("root");
  if (!rootElement) throw new Error("Minarva Biz renderer root element is missing.");

  const root = ReactDOM.createRoot(rootElement);

  // App is intentionally loaded after the root exists. A failure while evaluating
  // App.tsx or any of its dependencies must become a visible startup error rather
  // than escaping as a static-import failure before the renderer's error handling.
  const { App } = await import("./App");

  root.render(
    <React.StrictMode>
      <RendererErrorBoundary>
        <RendererReadyMarker>
          <App />
        </RendererReadyMarker>
      </RendererErrorBoundary>
    </React.StrictMode>
  );
}

void boot().catch(showBootstrapError);
