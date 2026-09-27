import { createHmac, randomUUID } from "node:crypto";

export type SupportChatMessage = { role: "user" | "assistant"; content: string };

export type SupportClientContext = {
  clientId?: string;
  appVersion?: string;
  edition?: string;
  platform?: string;
  module?: string;
  organizationName?: string;
  diagnostics?: Record<string, unknown> | null;
};

export type SupportRequestType = "technical_escalation" | "bug" | "feature_request" | "suggestion";
export type SupportPriority = "low" | "normal" | "high" | "urgent";

const REPO = "evertekitsolutions-del/minarvabiz";
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main`;
const GITHUB_API = `https://api.github.com/repos/${REPO}`;
const OPENAI_URL = "https://api.openai.com/v1/responses";
const KNOWLEDGE_TTL_MS = 15 * 60 * 1000;
const MAX_IMAGE_DATA_URL_CHARS = 2_600_000;

const KNOWLEDGE_DOCS = [
  "docs/FINAL_COMPLETION.md",
  "docs/DESKTOP.md",
  "docs/PRINTING.md",
  "docs/LICENSING.md",
  "docs/SECURE_WINDOWS_UPDATES.md",
  "docs/CUSTOMER_DELIVERY_RUNBOOK.md",
] as const;

type KnowledgeSource = { source: string; text: string };
let knowledgeCache: { expiresAt: number; sources: KnowledgeSource[] } | null = null;

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function serviceDbConfig() {
  const base = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return base && key ? { base: `${base}/rest/v1`, key } : null;
}

async function serviceDbFetch(path: string, init: RequestInit = {}) {
  const cfg = serviceDbConfig();
  if (!cfg) return { ok: false, data: null as unknown, error: "Support database is not configured." };
  const headers = new Headers(init.headers);
  headers.set("apikey", cfg.key);
  headers.set("content-type", "application/json");
  if (cfg.key.startsWith("sb_secret_")) headers.delete("authorization");
  else headers.set("authorization", `Bearer ${cfg.key}`);
  try {
    const response = await fetch(`${cfg.base}${path}`, {
      ...init,
      headers,
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(12_000),
    });
    const data = await response.json().catch(() => null);
    return {
      ok: response.ok,
      data,
      error: response.ok ? null : String((data as any)?.message || (data as any)?.error || response.statusText || "Support database request failed."),
    };
  } catch (error) {
    return { ok: false, data: null as unknown, error: error instanceof Error ? error.message : String(error) };
  }
}

function rateLimitSecret() {
  const value = String(process.env.SUPPORT_RATE_LIMIT_SECRET || process.env.LICENSE_RATE_LIMIT_SECRET || "").trim();
  return value.length >= 32 ? value : "";
}

function clientAddress(headers: Headers) {
  const forwarded = String(headers.get("x-forwarded-for") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return (
    String(headers.get("cf-connecting-ip") || "").trim() ||
    String(headers.get("x-real-ip") || "").trim() ||
    forwarded[0] ||
    "unknown"
  ).slice(0, 200);
}

export async function consumeSupportRateLimit(
  headers: Headers,
  bucket: string,
  limit: number,
  windowSeconds: number,
  clientId = "",
) {
  const secret = rateLimitSecret();
  if (!secret) {
    return { ok: false, allowed: false, remaining: 0, retryAfterSeconds: windowSeconds, error: "Support rate limiting is not configured." };
  }
  const raw = `${clientAddress(headers)}|${clean(clientId, 160)}`;
  const keyHash = createHmac("sha256", secret).update(raw).digest("hex");
  const cfg = serviceDbConfig();
  if (!cfg) {
    return { ok: false, allowed: false, remaining: 0, retryAfterSeconds: windowSeconds, error: "Support database is not configured." };
  }
  const response = await serviceDbFetch("/rpc/consume_license_rate_limit", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      p_bucket: bucket,
      p_key_hash: keyHash,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    }),
  });
  const rows = Array.isArray(response.data) ? response.data as Array<{ allowed?: boolean; remaining?: number; reset_at?: string }> : [];
  const row = rows[0];
  if (!response.ok || !row) {
    return { ok: false, allowed: false, remaining: 0, retryAfterSeconds: windowSeconds, error: response.error || "Support rate-limit service is unavailable." };
  }
  const resetAt = new Date(String(row.reset_at || "")).getTime();
  return {
    ok: true,
    allowed: Boolean(row.allowed),
    remaining: Math.max(0, Number(row.remaining || 0)),
    retryAfterSeconds: Number.isFinite(resetAt) ? Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)) : windowSeconds,
  };
}

export function supportCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  };
}

function imageDataUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_IMAGE_DATA_URL_CHARS) return null;
  return /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value) ? value : null;
}

function tokenize(text: string) {
  return [...new Set(text.toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) || [])].slice(0, 40);
}

function chunks(source: KnowledgeSource) {
  const normalized = source.text.replace(/\r/g, "");
  const sections = normalized.split(/\n(?=#{1,4}\s)/g);
  const output: KnowledgeSource[] = [];
  for (const section of sections) {
    if (section.length <= 2200) output.push({ source: source.source, text: section.trim() });
    else {
      for (let offset = 0; offset < section.length; offset += 1800) {
        output.push({ source: source.source, text: section.slice(offset, offset + 2200).trim() });
      }
    }
  }
  return output.filter((item) => item.text.length > 80);
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: { "user-agent": "MinarvaBiz-Support-Knowledge" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return "";
  return (await response.text()).slice(0, 300_000);
}

async function loadKnowledgeSources(): Promise<KnowledgeSource[]> {
  if (knowledgeCache && knowledgeCache.expiresAt > Date.now()) return knowledgeCache.sources;
  const docs = await Promise.all(
    KNOWLEDGE_DOCS.map(async (path) => ({ source: path, text: await fetchText(`${RAW_BASE}/${path}`) })),
  );

  let releaseText = "";
  let commitText = "";
  try {
    const [releaseResponse, commitsResponse] = await Promise.all([
      fetch(`${GITHUB_API}/releases/latest`, { headers: { accept: "application/vnd.github+json", "user-agent": "MinarvaBiz-Support-Knowledge" }, signal: AbortSignal.timeout(8_000) }),
      fetch(`${GITHUB_API}/commits?per_page=20`, { headers: { accept: "application/vnd.github+json", "user-agent": "MinarvaBiz-Support-Knowledge" }, signal: AbortSignal.timeout(8_000) }),
    ]);
    if (releaseResponse.ok) {
      const release = await releaseResponse.json() as any;
      releaseText = `Latest stable release: ${String(release.tag_name || "")}\n${String(release.name || "")}\n${String(release.body || "")}`;
    }
    if (commitsResponse.ok) {
      const commits = await commitsResponse.json() as any[];
      commitText = (Array.isArray(commits) ? commits : []).slice(0, 20)
        .map((item) => String(item?.commit?.message || "").split("\n")[0])
        .filter(Boolean)
        .join("\n");
    }
  } catch {
    // Repo documentation below remains sufficient when GitHub metadata is temporarily unavailable.
  }

  const sources = [
    ...docs.filter((item) => item.text),
    ...(releaseText ? [{ source: "GitHub latest release", text: releaseText }] : []),
    ...(commitText ? [{ source: "GitHub recent main commits", text: commitText }] : []),
  ];
  knowledgeCache = { expiresAt: Date.now() + KNOWLEDGE_TTL_MS, sources };
  return sources;
}

export async function supportKnowledge(query: string) {
  const sources = await loadKnowledgeSources();
  const terms = tokenize(query);
  const allChunks = sources.flatMap(chunks);
  const ranked = allChunks
    .map((item) => {
      const haystack = item.text.toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 3 : 0), 0)
        + (/latest|release|update|version/.test(query.toLowerCase()) && /release|update|version/.test(haystack) ? 5 : 0);
      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score);

  const selected = ranked.filter((item) => item.score > 0).slice(0, 7);
  const fallback = selected.length ? selected : ranked.slice(0, 4);
  return {
    sources: [...new Set(fallback.map((item) => item.source))],
    context: fallback.map((item) => `SOURCE: ${item.source}\n${item.text}`).join("\n\n---\n\n").slice(0, 18_000),
  };
}

function extractOutputText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  const parts: string[] = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content?.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function modelName() {
  return clean(process.env.MINARVA_SUPPORT_AI_MODEL || "gpt-5.6-luna", 120);
}

async function openAiResponse(input: {
  instructions: string;
  messages: SupportChatMessage[];
  image?: string | null;
  maxOutputTokens?: number;
}) {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key) return { ok: false as const, error: "AI support is not configured on the server." };

  const normalizedMessages = input.messages.slice(-12).map((message) => ({
    role: message.role,
    content: [{ type: "input_text", text: clean(message.content, 4000) }],
  }));
  if (!normalizedMessages.length) return { ok: false as const, error: "A support message is required." };

  const image = imageDataUrl(input.image);
  if (image) {
    const last = normalizedMessages[normalizedMessages.length - 1];
    last.content.push({ type: "input_image", image_url: image } as any);
  }

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: modelName(),
        instructions: input.instructions,
        input: normalizedMessages,
        max_output_tokens: input.maxOutputTokens ?? 1400,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = clean((payload as any)?.error?.message, 500);
      return { ok: false as const, error: detail || `AI support returned HTTP ${response.status}.` };
    }
    const text = extractOutputText(payload);
    if (!text) return { ok: false as const, error: "AI support returned an empty response." };
    return { ok: true as const, text };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
  }
}

function contextSummary(context: SupportClientContext) {
  const diagnostics = context.diagnostics && typeof context.diagnostics === "object"
    ? JSON.stringify(context.diagnostics).slice(0, 5000)
    : "not shared";
  return [
    `Installed app version: ${clean(context.appVersion, 80) || "unknown"}`,
    `Edition: ${clean(context.edition, 40) || "unknown"}`,
    `Platform: ${clean(context.platform, 120) || "unknown"}`,
    `Current module/page: ${clean(context.module, 120) || "unknown"}`,
    `Organization: ${clean(context.organizationName, 200) || "not shared"}`,
    `Redacted diagnostics: ${diagnostics}`,
  ].join("\n");
}

export async function answerTechnicalSupport(input: {
  message: string;
  history: SupportChatMessage[];
  image?: unknown;
  context: SupportClientContext;
}) {
  const query = clean(input.message, 4000);
  const knowledge = await supportKnowledge(query);
  const instructions = `You are Minarva Biz AI Support, a 24/7 product-support assistant for Minarva Biz boutique billing and management software.
Answer only questions related to Minarva Biz, its setup, modules, workflows, updates, licensing, backups, printing, data recovery, errors and safe troubleshooting.

Rules:
- Prefer the supplied product knowledge. Do not invent menu names, settings, releases or fixes.
- Distinguish the installed version from the latest release when that matters.
- If a screenshot is attached, inspect visible error text/UI state and explain the likely cause and exact safe next steps.
- Give concise numbered troubleshooting steps when solving a problem.
- Never ask for or expose license tokens, passwords, private API keys, full database contents, card data or other secrets.
- Do not tell the user to delete production data or edit the database directly unless the supplied documentation explicitly requires it.
- If evidence is insufficient, say what is unknown and recommend escalating the chat to Minarva Biz Support rather than guessing.
- Reply in the language used by the customer whenever practical.
- End with a short line beginning "Sources:" listing only the supplied source names that materially informed the answer.

CLIENT CONTEXT
${contextSummary(input.context)}

PRODUCT KNOWLEDGE
${knowledge.context}`;

  const messages: SupportChatMessage[] = [
    ...input.history.slice(-10),
    { role: "user", content: query },
  ];
  const response = await openAiResponse({
    instructions,
    messages,
    image: input.image as string | null,
    maxOutputTokens: 1500,
  });
  return response.ok
    ? { ok: true as const, answer: response.text, sources: knowledge.sources }
    : response;
}

export async function triageSupportRequest(input: {
  type: SupportRequestType;
  title: string;
  description: string;
  image?: unknown;
  context: SupportClientContext;
}) {
  const image = imageDataUrl(input.image);
  const response = await openAiResponse({
    instructions: `You triage Minarva Biz customer support submissions for an internal admin inbox.
Return a concise plain-text summary (maximum 8 lines) covering: request intent, likely module, user impact, reproduction clues, and a suggested priority.
If an image is attached, include the visible error/UI evidence. Do not invent facts and do not include secrets.`,
    messages: [{
      role: "user",
      content: `Type: ${input.type}\nTitle: ${clean(input.title, 200)}\nDescription: ${clean(input.description, 12000)}\nContext:\n${contextSummary(input.context)}`,
    }],
    image,
    maxOutputTokens: 500,
  });
  return response.ok ? response.text : "";
}

function clientHash(clientId: string) {
  const secret = rateLimitSecret();
  if (!secret || !clientId) return null;
  return createHmac("sha256", secret).update(clientId).digest("hex");
}

export async function createSupportRequest(input: {
  type: SupportRequestType;
  priority: SupportPriority;
  title: string;
  description: string;
  module?: string;
  contactEmail?: string;
  transcript?: SupportChatMessage[];
  aiSummary?: string;
  screenshotSummary?: string;
  context: SupportClientContext;
}) {
  const title = clean(input.title, 200);
  const description = clean(input.description, 12000);
  if (!title || !description) return { ok: false as const, error: "Title and description are required." };

  const transcript = (Array.isArray(input.transcript) ? input.transcript : [])
    .slice(-20)
    .map((message) => ({ role: message.role === "assistant" ? "assistant" : "user", content: clean(message.content, 4000) }))
    .filter((message) => message.content);

  const payload = {
    id: randomUUID(),
    request_type: input.type,
    status: "new",
    priority: input.priority,
    title,
    description,
    module: clean(input.module || input.context.module, 120) || null,
    organization_name: clean(input.context.organizationName, 200) || null,
    contact_email: clean(input.contactEmail, 320).toLowerCase() || null,
    app_version: clean(input.context.appVersion, 80) || null,
    edition: clean(input.context.edition, 40) || null,
    platform: clean(input.context.platform, 120) || null,
    client_hash: clientHash(clean(input.context.clientId, 160)),
    ai_summary: clean(input.aiSummary, 4000) || null,
    screenshot_summary: clean(input.screenshotSummary, 4000) || null,
    transcript,
    metadata: {
      diagnosticsShared: Boolean(input.context.diagnostics),
      submittedFrom: "minarva-biz-support-center",
    },
  };

  const result = await serviceDbFetch("/support_requests", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  if (!result.ok) return { ok: false as const, error: result.error || "Unable to submit support request." };
  const row = Array.isArray(result.data) ? result.data[0] as any : null;
  return { ok: true as const, requestId: clean(row?.id || payload.id, 80) };
}
