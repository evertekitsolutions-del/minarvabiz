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
const AI_GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/responses";
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

function supportBrokerUrl() {
  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  return base ? `${base}/functions/v1/minarva-support-broker` : "";
}

export function supportServiceCredential(headers?: Headers | null) {
  const portable = String(process.env.MINARVA_SUPPORT_SERVICE_TOKEN || "").trim();
  if (portable.length >= 32) return portable;
  return String(headers?.get("x-vercel-oidc-token") || process.env.VERCEL_OIDC_TOKEN || "").trim();
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

async function brokerFetch(body: Record<string, unknown>, oidcToken = "") {
  const url = supportBrokerUrl();
  const token = oidcToken || supportServiceCredential();
  if (!url || !token) {
    return { ok: false, data: null as any, error: "Support broker is not configured for this deployment." };
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const data = await response.json().catch(() => null);
    return {
      ok: response.ok && Boolean(data?.ok),
      data,
      error: response.ok && data?.ok
        ? null
        : clean(data?.error, 500) || `Support broker returned HTTP ${response.status}.`,
    };
  } catch (error) {
    return { ok: false, data: null as any, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function consumeSupportRateLimit(
  headers: Headers,
  bucket: string,
  limit: number,
  windowSeconds: number,
) {
  const response = await brokerFetch({
    op: "rate-limit",
    bucket,
    clientAddress: clientAddress(headers),
  }, supportServiceCredential(headers));
  const row = response.data;
  if (!response.ok || !row) {
    return {
      ok: false,
      allowed: false,
      remaining: 0,
      retryAfterSeconds: windowSeconds,
      error: response.error || "Support rate-limit service is unavailable.",
    };
  }
  const resetAt = new Date(String(row.resetAt || "")).getTime();
  return {
    ok: true,
    allowed: Boolean(row.allowed),
    remaining: Math.max(0, Number(row.remaining || 0)),
    retryAfterSeconds: Number.isFinite(resetAt) ? Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)) : windowSeconds,
    configuredLimit: limit,
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

type AiFailureCode =
  | "unconfigured"
  | "free_quota_exhausted"
  | "free_plan_restricted"
  | "billing_or_quota"
  | "authentication"
  | "model_unavailable"
  | "timeout"
  | "provider_unavailable"
  | "empty_response";

type AiRuntimeConfig = {
  kind: string;
  enabled: boolean;
  endpoint: string | null;
  textModel: string | null;
  visionModel: string | null;
  phase: string | null;
};

type PaidAiCredential = {
  url: string;
  key: string;
  gateway: boolean;
  transport: "vercel-ai-gateway-oidc" | "vercel-ai-gateway-key" | "openai-key-fallback";
};

let runtimeConfigCache: { expiresAt: number; value: AiRuntimeConfig } | null = null;

function paidAiFallbackEnabled() {
  return String(process.env.MINARVA_ALLOW_PAID_AI_FALLBACK || "").trim().toLowerCase() === "true";
}

function normalizeProviderEndpoint(value: unknown) {
  const raw = clean(value, 500);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local") ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return null;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

async function aiRuntimeConfig(oidcToken = ""): Promise<AiRuntimeConfig> {
  const envEndpoint = normalizeProviderEndpoint(process.env.MINARVA_FREE_AI_URL);
  if (envEndpoint) {
    return {
      kind: "cloudflare-workers-ai",
      enabled: true,
      endpoint: envEndpoint,
      textModel: clean(process.env.MINARVA_FREE_AI_TEXT_MODEL || "@cf/zai-org/glm-4.7-flash", 160),
      visionModel: clean(process.env.MINARVA_FREE_AI_VISION_MODEL || "@cf/google/gemma-4-26b-a4b-it", 160),
      phase: "env-override",
    };
  }

  if (runtimeConfigCache && runtimeConfigCache.expiresAt > Date.now()) return runtimeConfigCache.value;

  const response = await brokerFetch({ op: "runtime-config" }, oidcToken);
  const row = response.data?.config && typeof response.data.config === "object" ? response.data.config : {};
  const value: AiRuntimeConfig = {
    kind: clean((row as any).kind, 80) || "disabled",
    enabled: Boolean((row as any).enabled),
    endpoint: normalizeProviderEndpoint((row as any).endpoint),
    textModel: clean((row as any).textModel, 160) || null,
    visionModel: clean((row as any).visionModel, 160) || null,
    phase: clean((row as any).phase, 120) || null,
  };
  runtimeConfigCache = { expiresAt: Date.now() + 5 * 60_000, value };
  return value;
}

function paidModelName() {
  return clean(process.env.MINARVA_SUPPORT_AI_MODEL || "openai/gpt-5.4-mini", 120);
}

function paidAiCredentials(oidcToken = ""): PaidAiCredential | null {
  if (!paidAiFallbackEnabled()) return null;

  const explicitGatewayKey = String(process.env.AI_GATEWAY_API_KEY || "").trim();
  if (explicitGatewayKey) {
    return { url: AI_GATEWAY_URL, key: explicitGatewayKey, gateway: true, transport: "vercel-ai-gateway-key" };
  }
  const gatewayOidc = String(oidcToken || process.env.VERCEL_OIDC_TOKEN || "").trim();
  if (gatewayOidc) {
    return { url: AI_GATEWAY_URL, key: gatewayOidc, gateway: true, transport: "vercel-ai-gateway-oidc" };
  }
  const openAiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (openAiKey) {
    return { url: OPENAI_URL, key: openAiKey, gateway: false, transport: "openai-key-fallback" };
  }
  return null;
}

function classifyAiFailure(detail: string, status = 0, freeProvider = false): AiFailureCode {
  const value = detail.toLowerCase();
  if (freeProvider && (status === 429 || /daily|neuron|quota|limit exceeded|capacity/.test(value))) {
    return "free_quota_exhausted";
  }
  if (freeProvider && status === 403 && /paid|plan|upgrade|restricted/.test(value)) {
    return "free_plan_restricted";
  }
  if (/credit card|billing|credits?|quota|insufficient|payment/.test(value) || status === 402 || status === 429) {
    return "billing_or_quota";
  }
  if (/unauthorized|authentication|invalid api key|invalid token/.test(value) || status === 401) {
    return "authentication";
  }
  if (/model|provider/.test(value) && /not found|unavailable|disabled|restricted|unsupported/.test(value)) {
    return "model_unavailable";
  }
  if (/timeout|timed out|aborted/.test(value)) return "timeout";
  return "provider_unavailable";
}

function publicAiError(code: AiFailureCode) {
  if (code === "free_quota_exhausted") {
    return "Today’s free AI allowance has been used. AI Support will become available again after the free daily quota resets. You can still search the Help Center or send this conversation to Minarva Biz Support.";
  }
  if (code === "free_plan_restricted") {
    return "The configured free AI model is temporarily unavailable on the free plan. You can still use the Help Center or send this conversation to Minarva Biz Support.";
  }
  if (code === "billing_or_quota") {
    return "AI Support is temporarily unavailable because the configured AI service cannot accept more requests. You can still send this conversation to Minarva Biz Support.";
  }
  if (code === "authentication" || code === "unconfigured") {
    return "AI Support is temporarily unavailable because the free AI service is not fully configured. You can still send this conversation to Minarva Biz Support.";
  }
  if (code === "model_unavailable") {
    return "AI Support is temporarily unavailable because the configured AI model cannot be reached. You can still send this conversation to Minarva Biz Support.";
  }
  if (code === "timeout") {
    return "AI Support took too long to respond. Please retry, or send this conversation to Minarva Biz Support.";
  }
  return "AI Support is temporarily unavailable. Please retry, or send this conversation to Minarva Biz Support.";
}

async function executeFreeAiRequest(
  config: AiRuntimeConfig,
  input: {
    instructions: string;
    messages: SupportChatMessage[];
    image?: string | null;
    maxOutputTokens?: number;
    oidcToken?: string;
  },
) {
  if (!config.enabled || config.kind !== "cloudflare-workers-ai" || !config.endpoint || !input.oidcToken) {
    return {
      ok: false as const,
      error: publicAiError("unconfigured"),
      code: "unconfigured" as AiFailureCode,
    };
  }

  const messages = input.messages
    .slice(-12)
    .map((message) => ({ role: message.role, content: clean(message.content, 4000) }))
    .filter((message) => message.content);
  if (!messages.length) {
    return {
      ok: false as const,
      error: "A support message is required.",
      code: "provider_unavailable" as AiFailureCode,
    };
  }

  try {
    const response = await fetch(`${config.endpoint}/v1/respond`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.oidcToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        instructions: clean(input.instructions, 24_000),
        messages,
        image: imageDataUrl(input.image),
        maxOutputTokens: Math.max(16, Math.min(1600, Number(input.maxOutputTokens || 1400))),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      const detail = clean(payload?.error, 800) || `HTTP ${response.status}`;
      const code = classifyAiFailure(detail, response.status, true);
      console.warn("Minarva Biz free AI provider request failed", { code, status: response.status });
      return { ok: false as const, error: publicAiError(code), code };
    }

    const text = clean(payload?.text, 24_000);
    if (!text) {
      return {
        ok: false as const,
        error: publicAiError("empty_response"),
        code: "empty_response" as AiFailureCode,
      };
    }
    return {
      ok: true as const,
      text,
      transport: "cloudflare-workers-ai-free" as const,
      model: clean(payload?.model, 160) || (input.image ? config.visionModel : config.textModel),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const code = classifyAiFailure(detail, 0, true);
    console.warn("Minarva Biz free AI provider request failed", { code, status: 0 });
    return { ok: false as const, error: publicAiError(code), code };
  }
}

async function executePaidAiRequest(
  credentials: PaidAiCredential,
  input: {
    instructions: string;
    messages: SupportChatMessage[];
    image?: string | null;
    maxOutputTokens?: number;
  },
) {
  const normalizedMessages = input.messages.slice(-12).map((message) => ({
    role: message.role,
    content: [{ type: "input_text", text: clean(message.content, 4000) }],
  }));
  if (!normalizedMessages.length) {
    return { ok: false as const, error: "A support message is required.", code: "provider_unavailable" as AiFailureCode };
  }

  const image = imageDataUrl(input.image);
  if (image) {
    const last = normalizedMessages[normalizedMessages.length - 1];
    last.content.push({ type: "input_image", image_url: image } as any);
  }

  const configuredModel = paidModelName();
  const model = credentials.gateway
    ? (configuredModel.includes("/") ? configuredModel : `openai/${configuredModel}`)
    : configuredModel.replace(/^openai\//, "");

  const body: Record<string, unknown> = {
    model,
    instructions: input.instructions,
    input: normalizedMessages,
    max_output_tokens: input.maxOutputTokens ?? 1400,
  };
  if (credentials.gateway) {
    body.providerOptions = {
      gateway: {
        zeroDataRetention: true,
        disallowPromptTraining: true,
      },
    };
  }

  try {
    const response = await fetch(credentials.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${credentials.key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = clean((payload as any)?.error?.message || (payload as any)?.error, 800) || `HTTP ${response.status}`;
      const code = classifyAiFailure(detail, response.status);
      console.warn("Minarva Biz paid AI fallback request failed", {
        code,
        status: response.status,
        transport: credentials.transport,
      });
      return { ok: false as const, error: publicAiError(code), code };
    }

    const text = extractOutputText(payload);
    if (!text) {
      return {
        ok: false as const,
        error: publicAiError("empty_response"),
        code: "empty_response" as AiFailureCode,
      };
    }
    return { ok: true as const, text, transport: credentials.transport, model };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const code = classifyAiFailure(detail);
    console.warn("Minarva Biz paid AI fallback request failed", {
      code,
      status: 0,
      transport: credentials.transport,
    });
    return { ok: false as const, error: publicAiError(code), code };
  }
}

async function supportAiResponse(input: {
  instructions: string;
  messages: SupportChatMessage[];
  image?: string | null;
  maxOutputTokens?: number;
  oidcToken?: string;
}) {
  const config = await aiRuntimeConfig(input.oidcToken || "");
  const free = await executeFreeAiRequest(config, input);
  if (free.ok) return free;

  const paid = paidAiCredentials(input.oidcToken || "");
  if (paid) {
    const fallback = await executePaidAiRequest(paid, input);
    if (fallback.ok) return fallback;
    return fallback;
  }

  return free;
}

const READINESS_PROBE_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGP8//8/AymAiSTVoxpGNQwpDQBVbQMdPVIhQwAAAABJRU5ErkJggg==";
let readinessCache: { expiresAt: number; value: Record<string, unknown> } | null = null;

export async function supportConfigurationStatus(oidcToken = "") {
  if (readinessCache && readinessCache.expiresAt > Date.now()) return readinessCache.value;

  const runtimeConfig = await aiRuntimeConfig(oidcToken);
  const broker = await brokerFetch({ op: "readiness" }, oidcToken);
  const brokerChecks = broker.data?.checks && typeof broker.data.checks === "object" ? broker.data.checks : {};
  const retention = broker.data?.retention && typeof broker.data.retention === "object" ? broker.data.retention : {};

  const aiProbe = await supportAiResponse({
    instructions: "This is an automated Minarva Biz readiness check. Reply exactly OK.",
    messages: [{ role: "user", content: "Verify text and image input. Reply OK only." }],
    image: READINESS_PROBE_IMAGE,
    maxOutputTokens: 256,
    oidcToken,
  });

  const value = {
    aiConfigured: Boolean(runtimeConfig.enabled && runtimeConfig.endpoint) || Boolean(paidAiCredentials(oidcToken)),
    aiOperational: Boolean(aiProbe.ok),
    aiStatus: aiProbe.ok ? "operational" : aiProbe.code,
    aiError: aiProbe.ok ? null : aiProbe.error,
    databaseConfigured: Boolean((brokerChecks as any).database),
    rateLimitConfigured: Boolean((brokerChecks as any).rateLimit),
    submissionConfigured: Boolean((brokerChecks as any).submissionWrite && (brokerChecks as any).cleanup),
    runtimeConfigConfigured: Boolean((brokerChecks as any).runtimeConfig),
    brokerConfigured: Boolean(broker.ok),
    retentionConfigured: Boolean((retention as any).ok),
    retentionDays: Number((retention as any).days || 0) || null,
    aiTransport: aiProbe.ok
      ? aiProbe.transport
      : runtimeConfig.enabled
        ? "cloudflare-workers-ai-free"
        : paidAiFallbackEnabled()
          ? "paid-fallback"
          : "free-provider-unconfigured",
    model: aiProbe.ok
      ? aiProbe.model
      : (runtimeConfig.visionModel || runtimeConfig.textModel || (paidAiFallbackEnabled() ? paidModelName() : null)),
    zeroCostPhase: !paidAiFallbackEnabled(),
    paidFallbackEnabled: paidAiFallbackEnabled(),
  };

  readinessCache = {
    expiresAt: Date.now() + (aiProbe.ok && broker.ok ? 30 * 60_000 : 60_000),
    value,
  };
  return value;
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
  oidcToken?: string;
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
  const response = await supportAiResponse({
    instructions,
    messages,
    image: input.image as string | null,
    maxOutputTokens: 1500,
    oidcToken: input.oidcToken,
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
  oidcToken?: string;
}) {
  const image = imageDataUrl(input.image);
  const response = await supportAiResponse({
    instructions: `You triage Minarva Biz customer support submissions for an internal admin inbox.
Return a concise plain-text summary (maximum 8 lines) covering: request intent, likely module, user impact, reproduction clues, and a suggested priority.
If an image is attached, include the visible error/UI evidence. Do not invent facts and do not include secrets.`,
    messages: [{
      role: "user",
      content: `Type: ${input.type}\nTitle: ${clean(input.title, 200)}\nDescription: ${clean(input.description, 12000)}\nContext:\n${contextSummary(input.context)}`,
    }],
    image,
    maxOutputTokens: 500,
    oidcToken: input.oidcToken,
  });
  return response.ok ? response.text : "";
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
  oidcToken?: string;
}) {
  const title = clean(input.title, 200);
  const description = clean(input.description, 12000);
  if (!title || !description) return { ok: false as const, error: "Title and description are required." };

  const transcript = (Array.isArray(input.transcript) ? input.transcript : [])
    .slice(-20)
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: clean(message.content, 4000),
    }))
    .filter((message) => message.content);

  const request = {
    request_type: input.type,
    priority: input.priority,
    title,
    description,
    module: clean(input.module || input.context.module, 120) || null,
    organization_name: clean(input.context.organizationName, 200) || null,
    contact_email: clean(input.contactEmail, 320).toLowerCase() || null,
    app_version: clean(input.context.appVersion, 80) || null,
    edition: clean(input.context.edition, 40) || null,
    platform: clean(input.context.platform, 120) || null,
    client_id: clean(input.context.clientId, 160) || null,
    ai_summary: clean(input.aiSummary, 4000) || null,
    screenshot_summary: clean(input.screenshotSummary, 4000) || null,
    transcript,
    metadata: {
      diagnosticsShared: Boolean(input.context.diagnostics),
      submittedFrom: "minarva-biz-support-center",
    },
  };

  const result = await brokerFetch({ op: "create-request", request }, input.oidcToken || "");
  if (!result.ok) return { ok: false as const, error: result.error || "Unable to submit support request." };
  return { ok: true as const, requestId: clean(result.data?.requestId, 80) };
}
