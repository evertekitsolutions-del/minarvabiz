import { NextRequest, NextResponse } from "next/server";
import { supportConfigurationStatus } from "@/lib/support-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const status = await supportConfigurationStatus(request.headers.get("x-vercel-oidc-token") || "");
  const ready =
    status.aiConfigured &&
    status.aiOperational &&
    status.databaseConfigured &&
    status.rateLimitConfigured &&
    status.submissionConfigured &&
    status.brokerConfigured &&
    status.retentionConfigured;
  return NextResponse.json(
    {
      product: "minarvabiz",
      service: "ai-support",
      ready,
      ...status,
    },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
