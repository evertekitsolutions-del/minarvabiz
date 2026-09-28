import { NextRequest, NextResponse } from "next/server";
import {
  answerTechnicalSupport,
  consumeSupportRateLimit,
  supportCorsHeaders,
  type SupportChatMessage,
  type SupportClientContext,
} from "@/lib/support-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const message = clean(body?.message, 4000);
  const clientId = clean(body?.context?.clientId, 160);
  if (!message) {
    return NextResponse.json({ ok: false, error: "Enter a Minarva Biz support question." }, { status: 400, headers: supportCorsHeaders() });
  }

  const minute = await consumeSupportRateLimit(headers, "support-chat-minute", 8, 60);
  if (!minute.ok) {
    return NextResponse.json({ ok: false, error: minute.error || "AI support is temporarily unavailable." }, { status: 503, headers: supportCorsHeaders() });
  }
  if (!minute.allowed) {
    return NextResponse.json(
      { ok: false, error: `Too many support messages. Try again in about ${minute.retryAfterSeconds} seconds.` },
      { status: 429, headers: { ...supportCorsHeaders(), "Retry-After": String(minute.retryAfterSeconds) } },
    );
  }
  const hourly = await consumeSupportRateLimit(headers, "support-chat-hour", 40, 3600);
  if (!hourly.ok) {
    return NextResponse.json({ ok: false, error: hourly.error || "AI support is temporarily unavailable." }, { status: 503, headers: supportCorsHeaders() });
  }
  if (!hourly.allowed) {
    return NextResponse.json(
      { ok: false, error: "AI support message limit reached for this hour. You can still submit a support request from the Support Center." },
      { status: 429, headers: { ...supportCorsHeaders(), "Retry-After": String(hourly.retryAfterSeconds) } },
    );
  }

  const history: SupportChatMessage[] = (Array.isArray(body?.history) ? body.history : [])
    .slice(-10)
    .map((item: any) => ({
      role: item?.role === "assistant" ? "assistant" : "user",
      content: clean(item?.content, 4000),
    }))
    .filter((item: SupportChatMessage) => item.content);

  const context: SupportClientContext = {
    clientId,
    appVersion: clean(body?.context?.appVersion, 80),
    edition: clean(body?.context?.edition, 40),
    platform: clean(body?.context?.platform, 120),
    module: clean(body?.context?.module, 120),
    organizationName: clean(body?.context?.organizationName, 200),
    diagnostics: body?.context?.diagnostics && typeof body.context.diagnostics === "object" ? body.context.diagnostics : null,
  };

  const result = await answerTechnicalSupport({
    message,
    history,
    image: body?.image || null,
    context,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 503, headers: supportCorsHeaders() });
  }

  return NextResponse.json(
    { ok: true, answer: result.answer, sources: result.sources, remaining: hourly.remaining },
    { headers: supportCorsHeaders() },
  );
}
