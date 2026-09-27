"use client";

import * as React from "react";
import { Button } from "../Button";
import { FormField, inputClass, selectClass } from "../forms/FormField";

type SupportMode = "technical" | "feedback" | null;
type ChatMessage = { id: string; role: "user" | "assistant"; content: string };

export interface SupportCenterProps {
  apiBaseUrl?: string;
  organizationName?: string;
  currentModule?: string;
  edition?: string;
  appVersion?: string;
}

type DesktopSupportApi = {
  getVersion?: () => Promise<string>;
  platform?: string;
  sqliteExists?: () => Promise<boolean>;
  listBackups?: () => Promise<Array<{ createdAt: string; sizeBytes: number; kind: string; verified: boolean }>>;
  getLicenseState?: () => Promise<{
    status: string;
    plan: string | null;
    edition: string | null;
    daysRemaining: number | null;
    graceDaysRemaining: number | null;
    reason?: string;
  }>;
};

function endpoint(base: string, path: string) {
  const normalized = base.trim().replace(/\/$/, "");
  return normalized ? normalized + path : path;
}

function supportClientId() {
  if (typeof window === "undefined") return "";
  const key = "minarva_support_client_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing.slice(0, 160);
  const next = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(key, next);
  return next;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read screenshot."));
    reader.readAsDataURL(file);
  });
}

async function compressScreenshot(file: File) {
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) throw new Error("Upload a PNG, JPG or WebP screenshot.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Screenshot must be smaller than 8 MB before compression.");
  const source = await readFileAsDataUrl(file);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Unable to decode screenshot."));
    image.src = source;
  });

  const max = 1600;
  const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Screenshot processing is unavailable.");
  context.drawImage(image, 0, 0, width, height);
  let output = canvas.toDataURL("image/jpeg", 0.82);
  if (output.length > 2_400_000) output = canvas.toDataURL("image/jpeg", 0.65);
  if (output.length > 2_600_000) throw new Error("Screenshot is still too large. Crop the image and try again.");
  return output;
}

async function safeDesktopContext() {
  const api = (window as unknown as { minarvaDesktop?: DesktopSupportApi }).minarvaDesktop;
  if (!api) {
    return {
      version: "",
      edition: "online",
      platform: navigator.platform || "web",
      diagnostics: {
        online: navigator.onLine,
        language: navigator.language,
        userAgent: navigator.userAgent.slice(0, 300),
      },
    };
  }
  const [version, license, backups, sqliteExists] = await Promise.all([
    api.getVersion?.().catch(() => "") ?? Promise.resolve(""),
    api.getLicenseState?.().catch(() => null) ?? Promise.resolve(null),
    api.listBackups?.().catch(() => []) ?? Promise.resolve([]),
    api.sqliteExists?.().catch(() => false) ?? Promise.resolve(false),
  ]);
  const verified = backups.filter((item) => item.verified);
  const latest = verified.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  return {
    version,
    edition: license?.edition || "offline",
    platform: api.platform || navigator.platform || "desktop",
    diagnostics: {
      online: navigator.onLine,
      sqliteFilePresent: sqliteExists,
      backupCount: backups.length,
      verifiedBackupCount: verified.length,
      latestVerifiedBackupAt: latest?.createdAt || null,
      licenseStatus: license?.status || "unknown",
      licensePlan: license?.plan || null,
      licenseEdition: license?.edition || null,
      licenseDaysRemaining: license?.daysRemaining ?? null,
      licenseGraceDaysRemaining: license?.graceDaysRemaining ?? null,
    },
  };
}

function modeCard(
  title: string,
  description: string,
  badge: string,
  onClick: () => void,
  accent: string,
) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold ${accent}`}>✦</div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">{badge}</span>
      </div>
      <h3 className="mt-5 text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      <div className="mt-5 text-sm font-semibold text-indigo-700">Open →</div>
    </button>
  );
}

export function SupportCenter({
  apiBaseUrl = "",
  organizationName = "",
  currentModule = "",
  edition = "",
  appVersion = "",
}: SupportCenterProps) {
  const [mode, setMode] = React.useState<SupportMode>(null);
  const [clientId] = React.useState(() => supportClientId());
  const [detectedVersion, setDetectedVersion] = React.useState(appVersion);
  const [detectedEdition, setDetectedEdition] = React.useState(edition);
  const [detectedPlatform, setDetectedPlatform] = React.useState("");
  const [diagnostics, setDiagnostics] = React.useState<Record<string, unknown> | null>(null);
  const [shareDiagnostics, setShareDiagnostics] = React.useState(false);

  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hi — I’m Minarva Biz AI Support. Ask me about billing, printing, backup, licensing, updates, inventory, services or any error you see. You can also attach a screenshot.",
    },
  ]);
  const [chatText, setChatText] = React.useState("");
  const [chatImage, setChatImage] = React.useState<string | null>(null);
  const [chatImageName, setChatImageName] = React.useState("");
  const [chatBusy, setChatBusy] = React.useState(false);
  const [chatError, setChatError] = React.useState("");
  const [escalationMessage, setEscalationMessage] = React.useState("");

  const [feedbackType, setFeedbackType] = React.useState<"feature_request" | "suggestion">("feature_request");
  const [feedbackTitle, setFeedbackTitle] = React.useState("");
  const [feedbackDescription, setFeedbackDescription] = React.useState("");
  const [feedbackModule, setFeedbackModule] = React.useState(currentModule);
  const [feedbackPriority, setFeedbackPriority] = React.useState<"low" | "normal" | "high">("normal");
  const [feedbackEmail, setFeedbackEmail] = React.useState("");
  const [feedbackImage, setFeedbackImage] = React.useState<string | null>(null);
  const [feedbackImageName, setFeedbackImageName] = React.useState("");
  const [feedbackBusy, setFeedbackBusy] = React.useState(false);
  const [feedbackMessage, setFeedbackMessage] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    void safeDesktopContext().then((context) => {
      if (cancelled) return;
      if (!appVersion) setDetectedVersion(context.version);
      if (!edition) setDetectedEdition(context.edition);
      setDetectedPlatform(context.platform);
      setDiagnostics(context.diagnostics);
    });
    return () => { cancelled = true; };
  }, [appVersion, edition]);

  const requestContext = React.useMemo(() => ({
    clientId,
    appVersion: detectedVersion || appVersion || "online-current",
    edition: detectedEdition || edition || "online",
    platform: detectedPlatform || (typeof navigator !== "undefined" ? navigator.platform : "web"),
    module: currentModule || feedbackModule || "",
    organizationName,
    diagnostics: shareDiagnostics ? diagnostics : null,
  }), [
    appVersion,
    clientId,
    currentModule,
    detectedEdition,
    detectedPlatform,
    detectedVersion,
    diagnostics,
    edition,
    feedbackModule,
    organizationName,
    shareDiagnostics,
  ]);

  async function chooseChatImage(file?: File) {
    if (!file) return;
    setChatError("");
    try {
      setChatImage(await compressScreenshot(file));
      setChatImageName(file.name);
    } catch (error) {
      setChatImage(null);
      setChatImageName("");
      setChatError(error instanceof Error ? error.message : "Unable to prepare screenshot.");
    }
  }

  async function chooseFeedbackImage(file?: File) {
    if (!file) return;
    setFeedbackMessage("");
    try {
      setFeedbackImage(await compressScreenshot(file));
      setFeedbackImageName(file.name);
    } catch (error) {
      setFeedbackImage(null);
      setFeedbackImageName("");
      setFeedbackMessage(error instanceof Error ? error.message : "Unable to prepare screenshot.");
    }
  }

  async function sendChat() {
    const text = chatText.trim();
    if (!text || chatBusy) return;
    setChatBusy(true);
    setChatError("");
    const prior = messages
      .filter((message) => message.id !== "welcome")
      .map(({ role, content }) => ({ role, content }));
    const userMessage: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: text };
    setMessages((current) => [...current, userMessage]);
    setChatText("");

    try {
      const response = await fetch(endpoint(apiBaseUrl, "/api/support/chat"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: prior,
          image: chatImage,
          context: requestContext,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "AI support is temporarily unavailable.");
      setMessages((current) => [
        ...current,
        { id: `a-${Date.now()}`, role: "assistant", content: String(payload.answer || "No response returned.") },
      ]);
      setChatImage(null);
      setChatImageName("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to contact AI support.";
      setChatError(message);
      setMessages((current) => [
        ...current,
        { id: `a-${Date.now()}`, role: "assistant", content: "I couldn’t reach the AI support service. You can retry or send this conversation to Minarva Biz Support." },
      ]);
    } finally {
      setChatBusy(false);
    }
  }

  async function escalateChat() {
    const transcript = messages.filter((message) => message.id !== "welcome");
    const firstUser = transcript.find((message) => message.role === "user")?.content || "AI support escalation";
    if (!transcript.length) {
      setEscalationMessage("Ask at least one question before escalating the conversation.");
      return;
    }
    setEscalationMessage("Sending…");
    try {
      const response = await fetch(endpoint(apiBaseUrl, "/api/support/feedback"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "technical_escalation",
          priority: "high",
          title: firstUser.slice(0, 160),
          description: "Customer requested human review after using Minarva Biz AI Support.",
          module: currentModule,
          transcript: transcript.map(({ role, content }) => ({ role, content })),
          image: chatImage,
          context: requestContext,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to send support escalation.");
      setEscalationMessage(`Sent to support. Reference: ${payload.requestId}`);
    } catch (error) {
      setEscalationMessage(error instanceof Error ? error.message : "Unable to send support escalation.");
    }
  }

  async function submitFeedback() {
    if (!feedbackTitle.trim() || !feedbackDescription.trim() || feedbackBusy) return;
    setFeedbackBusy(true);
    setFeedbackMessage("");
    try {
      const response = await fetch(endpoint(apiBaseUrl, "/api/support/feedback"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: feedbackType,
          priority: feedbackPriority,
          title: feedbackTitle.trim(),
          description: feedbackDescription.trim(),
          module: feedbackModule.trim(),
          contactEmail: feedbackEmail.trim(),
          image: feedbackImage,
          context: { ...requestContext, module: feedbackModule.trim() || currentModule },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to submit feedback.");
      setFeedbackMessage(`Thank you. Your request is in the admin Support Inbox. Reference: ${payload.requestId}`);
      setFeedbackTitle("");
      setFeedbackDescription("");
      setFeedbackImage(null);
      setFeedbackImageName("");
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : "Unable to submit feedback.");
    } finally {
      setFeedbackBusy(false);
    }
  }

  if (!mode) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-2xl bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-7 text-white shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">Minarva Biz Support Center</div>
              <h2 className="mt-2 text-2xl font-bold">24/7 AI help + direct product feedback</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Get guided help for Minarva Biz, including screenshot analysis, or send feature ideas and workflow improvements directly to the product admin inbox.
              </p>
            </div>
            <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${typeof navigator !== "undefined" && navigator.onLine ? "bg-emerald-400/15 text-emerald-200" : "bg-amber-400/15 text-amber-200"}`}>
              {typeof navigator !== "undefined" && navigator.onLine ? "● Online" : "● Internet required"}
            </span>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {modeCard(
            "AI Technical Support",
            "Ask anything about the software. Upload an error screenshot and the AI will inspect it, explain the likely cause and give safe step-by-step troubleshooting.",
            "24/7 AI",
            () => setMode("technical"),
            "bg-indigo-50 text-indigo-700",
          )}
          {modeCard(
            "Ideas & Feature Requests",
            "Tell us what would make Minarva Biz easier or better for your business. Requests are recorded in the admin Support Inbox for review and planning.",
            "Direct to Admin",
            () => setMode("feedback"),
            "bg-violet-50 text-violet-700",
          )}
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
          For privacy, do not upload passwords, license tokens, payment-card details or screenshots containing customer-sensitive information unless it is necessary and safe to share.
        </div>
      </div>
    );
  }

  if (mode === "technical") {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button type="button" onClick={() => setMode(null)} className="text-sm font-medium text-indigo-700 hover:underline">← Support Center</button>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">AI Technical Support</h2>
            <p className="mt-1 text-sm text-slate-500">Version {detectedVersion || appVersion || "online"} · {detectedEdition || edition || "online"} · screenshot analysis supported</p>
          </div>
          <Button variant="outline" onClick={() => {
            setMessages([messages[0]]);
            setChatText("");
            setChatImage(null);
            setChatImageName("");
            setChatError("");
            setEscalationMessage("");
          }}>New chat</Button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="max-h-[52vh] min-h-[360px] space-y-4 overflow-y-auto p-5" aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-indigo-600 text-white" : "border border-slate-200 bg-slate-50 text-slate-800"}`}>
                  {message.content}
                </div>
              </div>
            ))}
            {chatBusy && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">Analyzing Minarva Biz context…</div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 p-4">
            {chatImage && (
              <div className="mb-3 flex items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
                <span>Screenshot attached: {chatImageName || "image"}</span>
                <button type="button" onClick={() => { setChatImage(null); setChatImageName(""); }} className="font-semibold">Remove</button>
              </div>
            )}
            <textarea
              className={inputClass + " h-auto min-h-24 resize-y py-3"}
              value={chatText}
              onChange={(event) => setChatText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendChat();
                }
              }}
              maxLength={4000}
              placeholder="Describe the problem or ask a Minarva Biz question…"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium hover:bg-slate-50">
                  Attach screenshot
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => void chooseChatImage(event.target.files?.[0])} />
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={shareDiagnostics} onChange={(event) => setShareDiagnostics(event.target.checked)} />
                  Share redacted diagnostics
                </label>
              </div>
              <Button onClick={() => void sendChat()} disabled={!chatText.trim() || chatBusy}>{chatBusy ? "Analyzing…" : "Send"}</Button>
            </div>
            {chatError && <p className="mt-3 text-sm text-red-600">{chatError}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">Still need help?</div>
            <div className="mt-1 text-xs text-slate-500">Send this conversation to the Minarva Biz admin Support Inbox for human review.</div>
            {escalationMessage && <div className="mt-2 text-xs font-medium text-indigo-700">{escalationMessage}</div>}
          </div>
          <Button variant="outline" onClick={() => void escalateChat()}>Escalate to Support</Button>
        </div>

        <p className="text-xs leading-5 text-slate-500">AI responses can be imperfect. Minarva Biz Support is designed to avoid destructive fixes and to escalate when the available product evidence is insufficient.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <button type="button" onClick={() => setMode(null)} className="text-sm font-medium text-indigo-700 hover:underline">← Support Center</button>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Ideas & Feature Requests</h2>
        <p className="mt-1 text-sm text-slate-500">Your submission goes directly into the Minarva Biz admin Support Inbox with version and module context.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Request type">
            <select className={selectClass} value={feedbackType} onChange={(event) => setFeedbackType(event.target.value as "feature_request" | "suggestion")}>
              <option value="feature_request">New feature request</option>
              <option value="suggestion">Convenience / workflow suggestion</option>
            </select>
          </FormField>
          <FormField label="Importance">
            <select className={selectClass} value={feedbackPriority} onChange={(event) => setFeedbackPriority(event.target.value as "low" | "normal" | "high")}>
              <option value="low">Nice to have</option>
              <option value="normal">Useful improvement</option>
              <option value="high">Important for daily work</option>
            </select>
          </FormField>
          <FormField label="Title" className="md:col-span-2">
            <input className={inputClass} maxLength={200} value={feedbackTitle} onChange={(event) => setFeedbackTitle(event.target.value)} placeholder="Example: Add WhatsApp button inside invoice history" />
          </FormField>
          <FormField label="Module / area">
            <input className={inputClass} maxLength={120} value={feedbackModule} onChange={(event) => setFeedbackModule(event.target.value)} placeholder="Billing, Products, Services, Reports…" />
          </FormField>
          <FormField label="Contact email (optional)">
            <input className={inputClass} type="email" maxLength={320} value={feedbackEmail} onChange={(event) => setFeedbackEmail(event.target.value)} placeholder="For follow-up if needed" />
          </FormField>
          <FormField label="What should change, and why?" className="md:col-span-2">
            <textarea className={inputClass + " h-auto min-h-36 resize-y py-3"} maxLength={12000} value={feedbackDescription} onChange={(event) => setFeedbackDescription(event.target.value)} placeholder="Explain the current workflow, what is inconvenient, and how you would prefer it to work." />
          </FormField>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
              Attach screenshot
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => void chooseFeedbackImage(event.target.files?.[0])} />
            </label>
            {feedbackImage && <span className="text-xs text-slate-500">{feedbackImageName} <button type="button" className="ml-1 font-semibold text-red-600" onClick={() => { setFeedbackImage(null); setFeedbackImageName(""); }}>Remove</button></span>}
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={shareDiagnostics} onChange={(event) => setShareDiagnostics(event.target.checked)} />
              Include redacted diagnostics
            </label>
          </div>
          <Button onClick={() => void submitFeedback()} disabled={feedbackBusy || !feedbackTitle.trim() || !feedbackDescription.trim()}>
            {feedbackBusy ? "Submitting…" : "Send to Product Team"}
          </Button>
        </div>
        {feedbackMessage && <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{feedbackMessage}</p>}
      </div>

      <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-xs leading-5 text-indigo-800">
        We record the request text, selected module, app version and the redacted context you choose to share. Raw database contents, license tokens and device IDs are not included.
      </div>
    </div>
  );
}
