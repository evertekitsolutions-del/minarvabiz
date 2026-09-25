import { NextRequest, NextResponse } from "next/server";
import { buildMinarvaNonceCsp, minarvaHttpSecurityHeaders } from "@minarvabiz/utils/security-headers";

function isPlaceholder(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    !normalized ||
    normalized.includes("your-project") ||
    normalized.includes("your-anon") ||
    normalized.includes("change-me")
  );
}

function createNonce(): string {
  return Buffer.from(crypto.randomUUID(), "utf8").toString("base64");
}

function connectSources(): string[] {
  const sources = ["'self'"];
  const publicSupabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();

  if (publicSupabaseUrl && !isPlaceholder(publicSupabaseUrl)) {
    try {
      const parsed = new URL(publicSupabaseUrl);
      sources.push(parsed.origin);
      if (parsed.protocol === "https:") sources.push("wss://" + parsed.host);
      else if (parsed.protocol === "http:") sources.push("ws://" + parsed.host);
    } catch {
      // next.config.ts rejects invalid production configuration; middleware fails closed to self here.
    }
  }

  if (process.env.NODE_ENV !== "production") {
    sources.push(
      "http://localhost:*",
      "http://127.0.0.1:*",
      "ws://localhost:*",
      "ws://127.0.0.1:*",
    );
  }

  return Array.from(new Set(sources));
}

export function middleware(request: NextRequest) {
  const nonce = createNonce();
  const contentSecurityPolicy = buildMinarvaNonceCsp({
    nonce,
    environment: process.env.NODE_ENV,
    connectSources: connectSources(),
    imageSources: ["https:"],
    workerSources: ["'self'", "blob:"],
    manifestSources: ["'self'"],
  });

  if (!["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
    const response = new NextResponse("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD, OPTIONS" },
    });
    for (const header of minarvaHttpSecurityHeaders()) {
      response.headers.set(header.key, header.value);
    }
    response.headers.set("Content-Security-Policy", contentSecurityPolicy);
    return response;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
