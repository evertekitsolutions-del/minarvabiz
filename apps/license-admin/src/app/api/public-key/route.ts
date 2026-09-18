import { NextResponse } from "next/server";
import { publicKeyHex } from "../../../lib/signing-key";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const key = publicKeyHex();
    if (!/^[0-9a-f]{64}$/.test(key)) {
      return NextResponse.json({ error: "License signing key is not configured." }, { status: 503 });
    }
    return NextResponse.json(
      { publicKeyHex: key },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    return NextResponse.json({ error: "License signing key is not configured." }, { status: 503 });
  }
}
