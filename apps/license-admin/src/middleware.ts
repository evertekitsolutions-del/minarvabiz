import { NextRequest, NextResponse } from "next/server";
import { buildNonceCsp, createCspNonce } from "@minarvabiz/security-headers";

export function middleware(request: NextRequest) {
  const nonce = createCspNonce();
  const contentSecurityPolicy = buildNonceCsp({
    nonce,
    development: process.env.NODE_ENV === "development",
    production: process.env.NODE_ENV === "production",
    connectSources: ["'self'"],
    imageSources: ["'self'", "blob:", "data:"],
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
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
