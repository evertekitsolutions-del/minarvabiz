import { NextResponse } from "next/server";
import { supportConfigurationStatus } from "@/lib/support-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = supportConfigurationStatus();
  const ready = status.aiConfigured && status.databaseConfigured && status.rateLimitConfigured;
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
