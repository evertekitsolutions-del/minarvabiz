import { NextResponse } from "next/server";
import rootPackage from "../../../../../../../package.json";
import { signTextBase64Url } from "../../../../lib/signing-key";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RELEASE_DOWNLOAD_BASE = "https://github.com/evertekitsolutions-del/minarvabiz/releases/download";

function canonicalManifest(input: {
  product: "minarvabiz";
  version: string;
  installerUrl: string;
  sha256: string;
  publishedAt: string;
}) {
  return [
    "minarvabiz-update-v1",
    input.product,
    input.version,
    input.installerUrl,
    input.sha256.toLowerCase(),
    input.publishedAt,
  ].join("\n");
}

function cleanSha(value: string | null | undefined) {
  const raw = String(value || "").trim().toLowerCase().replace(/^sha256:/, "");
  return /^[0-9a-f]{64}$/.test(raw) ? raw : "";
}

function releaseVersion() {
  const version = String(rootPackage.version || "").trim();
  return /^\d+\.\d+\.\d+$/.test(version) ? version : "";
}

function responseTimestamp(response: Response) {
  for (const header of ["last-modified", "date"]) {
    const value = response.headers.get(header);
    if (!value) continue;
    const timestamp = new Date(value);
    if (Number.isFinite(timestamp.getTime())) return timestamp.toISOString();
  }
  return new Date().toISOString();
}

async function checksumForVersion(version: string) {
  const installerName = `MinarvaBiz-Setup-${version}.exe`;
  const checksumUrl = `${RELEASE_DOWNLOAD_BASE}/v${version}/${installerName}.sha256`;
  const response = await fetch(checksumUrl, {
    headers: { accept: "text/plain", "user-agent": "MinarvaBiz-Update-Manifest" },
    cache: "no-store",
    redirect: "follow",
  });
  if (!response.ok) {
    console.error("[update-manifest] checksum asset unavailable", { status: response.status, version });
    return null;
  }

  const text = (await response.text()).trim();
  const match = text.match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
  const sha256 = cleanSha(match?.[1]);
  const declaredName = String(match?.[2] || "").trim();
  if (!sha256 || declaredName !== installerName) {
    console.error("[update-manifest] checksum asset is malformed", { version });
    return null;
  }

  return { sha256, publishedAt: responseTimestamp(response) };
}

export async function GET() {
  try {
    const version = releaseVersion();
    if (!version) {
      return NextResponse.json({ error: "Stable release version is invalid." }, { status: 503 });
    }

    const installerName = `MinarvaBiz-Setup-${version}.exe`;
    const installerUrl = `${RELEASE_DOWNLOAD_BASE}/v${version}/${installerName}`;
    const checksum = await checksumForVersion(version);
    if (!checksum) {
      return NextResponse.json({ error: "Stable installer checksum is unavailable." }, { status: 503 });
    }

    const unsigned = {
      product: "minarvabiz" as const,
      version,
      installerUrl,
      sha256: checksum.sha256,
      publishedAt: checksum.publishedAt,
    };
    const signature = signTextBase64Url(canonicalManifest(unsigned));

    return NextResponse.json(
      {
        ...unsigned,
        notes: `Minarva Biz ${version}`,
        signature,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("[update-manifest] unavailable", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Update manifest service is unavailable." }, { status: 503 });
  }
}
