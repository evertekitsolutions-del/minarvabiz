import { NextRequest, NextResponse } from "next/server";
import {
  consumeSupportRateLimit,
  createSupportRequest,
  supportCorsHeaders,
  triageSupportRequest,
  type SupportChatMessage,
  type SupportClientContext,
  type SupportPriority,
  type SupportRequestType,
} from "@/lib/support-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Set<SupportRequestType>(["technical_escalation", "bug", "feature_request", "suggestion"]);
const PRIORITIES = new Set<SupportPriority>(["low", "normal", "high", "urgent"]);

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: supportCorsHeaders() });
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: NextRequest) {
  const headers = new Headers(request.headers);
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON request." }, { status: 400, headers: supportCorsHeaders() });
  }

  const clientId = clean(body?.context?.clientId, 160);
  const oidcToken = clean(headers.get("x-vercel-oidc-token"), 12000);
  const rate = await consumeSupportRateLimit(headers, "support-submit-day", 20, 86400);
  if (!rate.ok) {
    return NextResponse.json({ ok: false, error: rate.error || "Support submission service is unavailable." }, { status: 503, headers: supportCorsHeaders() });
  }
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "Daily support submission limit reached. Please try again later." },
      { status: 429, headers: { ...supportCorsHeaders(), "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const type = clean(body?.type, 40) as SupportRequestType;
  const priority = clean(body?.priority, 20) as SupportPriority;
  const title = clean(body?.title, 200);
  const description = clean(body?.description, 12000);
  const contactEmail = clean(body?.contactEmail, 320).toLowerCase();
  if (!TYPES.has(type) || !PRIORITIES.has(priority) || !title || !description) {
    return NextResponse.json({ ok: false, error: "Enter a valid support request type, priority, title and description." }, { status: 400, headers: supportCorsHeaders() });
  }
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return NextResponse.json({ ok: false, error: "Enter a valid contact email address." }, { status: 400, headers: supportCorsHeaders() });
  }

  const context: SupportClientContext = {
    clientId,
    appVersion: clean(body?.context?.appVersion, 80),
    edition: clean(body?.context?.edition, 40),
    platform: clean(body?.context?.platform, 120),
    module: clean(body?.context?.module, 120),
    organizationName: clean(body?.context?.organizationName, 200),
    diagnostics: body?.context?.diagnostics && typeof body.context.diagnostics === "object" ? body.context.diagnostics : null,
  };

  const transcript: SupportChatMessage[] = (Array.isArray(body?.transcript) ? body.transcript : [])
    .slice(-20)
    .map((item: any) => ({
      role: item?.role === "assistant" ? "assistant" : "user",
      content: clean(item?.content, 4000),
    }))
    .filter((item: SupportChatMessage) => item.content);

  const aiSummary = await triageSupportRequest({
    type,
    title,
    description,
    image: body?.image || null,
    context,
    oidcToken,
  });

  const result = await createSupportRequest({
    type,
    priority,
    title,
    description,
    module: clean(body?.module, 120),
    contactEmail,
    transcript,
    aiSummary,
    screenshotSummary: body?.image ? aiSummary : "",
    context,
    oidcToken,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 503, headers: supportCorsHeaders() });
  }
  return NextResponse.json(
    { ok: true, requestId: result.requestId, message: "Your request has been sent to Minarva Biz Support." },
    { status: 201, headers: supportCorsHeaders() },
  );
}
