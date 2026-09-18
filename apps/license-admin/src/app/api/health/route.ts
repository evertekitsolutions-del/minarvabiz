import { NextResponse } from "next/server";
import { publicKeyHex } from "../../../lib/signing-key";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function supabaseConfig() {
  const base = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return base && key ? { base, key } : null;
}

export async function GET() {
  try {
    const publicKey = publicKeyHex();
    if (!/^[0-9a-f]{64}$/.test(publicKey)) {
      return NextResponse.json({ status: "error", signingKey: "missing", database: "unknown" }, { status: 503 });
    }

    const cfg = supabaseConfig();
    if (!cfg) {
      return NextResponse.json({ status: "error", signingKey: "ok", database: "not_configured" }, { status: 503 });
    }

    const headers = new Headers();
    headers.set("apikey", cfg.key);
    if (!cfg.key.startsWith("sb_secret_")) headers.set("authorization", `Bearer ${cfg.key}`);

    const response = await fetch(`${cfg.base}/rest/v1/licenses?select=id&limit=1`, {
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ status: "error", signingKey: "ok", database: "unreachable" }, { status: 503 });
    }

    return NextResponse.json(
      { status: "ok", signingKey: "ok", database: "ok" },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    return NextResponse.json({ status: "error", signingKey: "unknown", database: "unknown" }, { status: 503 });
  }
}
