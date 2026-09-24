import { NextRequest, NextResponse } from "next/server";
import { buildMinarvaNonceCsp } from "@minarvabiz/utils/security-headers";

function createNonce(): string {
  return Buffer.from(crypto.randomUUID(), "utf8").toString("base64");
}

export function middleware(request: NextRequest) {
  const nonce = createNonce();
  const contentSecurityPolicy = buildMinarvaNonceCsp({
    nonce,
    environment: process.env.NODE_ENV,
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
