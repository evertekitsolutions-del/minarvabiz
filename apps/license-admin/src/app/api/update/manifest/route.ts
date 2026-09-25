import { NextResponse } from "next/server";
import { signTextBase64Url } from "../../../../lib/signing-key";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RELEASE_API = "https://api.github.com/repos/evertekitsolutions-del/minarvabiz/releases/latest";

type GithubAsset = {
  name?: string;
  browser_download_url?: string;
  digest?: string | null;
};

type GithubRelease = {
  tag_name?: string;
  name?: string;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GithubAsset[];
};

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

async function checksumForAsset(release: GithubRelease, installer: GithubAsset, version: string) {
  const digest = cleanSha(installer.digest);
  if (digest) return digest;

  const checksumName = `MinarvaBiz-Setup-${version}.exe.sha256`;
  const checksum = release.assets?.find((asset) => asset.name === checksumName);
  if (!checksum?.browser_download_url) return "";

  const response = await fetch(checksum.browser_download_url, {
    headers: { accept: "text/plain", "user-agent": "MinarvaBiz-Update-Manifest" },
    cache: "no-store",
  });
  if (!response.ok) return "";
  const text = await response.text();
  return cleanSha(text.match(/[0-9a-f]{64}/i)?.[0] || "");
}

export async function GET() {
  try {
    const response = await fetch(RELEASE_API, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "MinarvaBiz-Update-Manifest",
        "x-github-api-version": "2022-11-28",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json({ error: "Update release is not available." }, { status: 503 });
    }

    const release = await response.json() as GithubRelease;
    if (release.draft || release.prerelease) {
      return NextResponse.json({ error: "No stable update release is available." }, { status: 503 });
    }

    const tag = String(release.tag_name || "");
    const version = tag.startsWith("v") ? tag.slice(1) : "";
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      return NextResponse.json({ error: "Stable release version is invalid." }, { status: 503 });
    }

    const assetName = `MinarvaBiz-Setup-${version}.exe`;
    const installer = release.assets?.find((asset) => asset.name === assetName);
    const installerUrl = String(installer?.browser_download_url || "");
    if (!installerUrl.startsWith("https://github.com/evertekitsolutions-del/minarvabiz/releases/download/")) {
      return NextResponse.json({ error: "Stable installer asset is unavailable." }, { status: 503 });
    }

    const sha256 = await checksumForAsset(release, installer || {}, version);
    if (!sha256) {
      return NextResponse.json({ error: "Stable installer checksum is unavailable." }, { status: 503 });
    }

    const publishedAt = String(release.published_at || "");
    if (!Number.isFinite(new Date(publishedAt).getTime())) {
      return NextResponse.json({ error: "Stable release timestamp is invalid." }, { status: 503 });
    }

    const unsigned = {
      product: "minarvabiz" as const,
      version,
      installerUrl,
      sha256,
      publishedAt,
    };
    const signature = signTextBase64Url(canonicalManifest(unsigned));

    return NextResponse.json(
      {
        ...unsigned,
        notes: String(release.name || `Minarva Biz ${version}`).slice(0, 1000),
        signature,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    return NextResponse.json({ error: "Update manifest service is unavailable." }, { status: 503 });
  }
}
