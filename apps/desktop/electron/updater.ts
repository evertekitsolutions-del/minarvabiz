import * as fs from "fs";
import * as path from "path";
import { createHash, createPublicKey, verify } from "crypto";
import { BUNDLED_UPDATE_MANIFEST_URL, BUNDLED_UPDATE_PUBLIC_KEY_HEX } from "./update-config";

export type UpdateManifest = {
  product: "minarvabiz";
  version: string;
  installerUrl: string;
  sha256: string;
  publishedAt: string;
  notes?: string;
  signature: string;
};

export type UpdateCheckResult = {
  status: "disabled" | "up_to_date" | "available" | "error";
  currentVersion: string;
  version?: string;
  publishedAt?: string;
  notes?: string;
  error?: string;
};

export type UpdateDownloadResult = {
  ok: boolean;
  version?: string;
  installerPath?: string;
  error?: string;
};

let verifiedManifest: UpdateManifest | null = null;
let downloadedInstaller: { version: string; path: string; sha256: string } | null = null;

function config() {
  const manifestUrl = String(process.env.MINARVA_UPDATE_MANIFEST_URL || BUNDLED_UPDATE_MANIFEST_URL || "").trim();
  const publicKeyHex = String(process.env.MINARVA_UPDATE_PUBLIC_KEY_HEX || BUNDLED_UPDATE_PUBLIC_KEY_HEX || "")
    .replace(/^0x/i, "").replace(/\s/g, "").toLowerCase();
  return { manifestUrl, publicKeyHex };
}

function hexToBytes(hex: string) {
  const out = Buffer.alloc(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function fromBase64Url(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4), "base64");
}

function canonicalManifest(manifest: UpdateManifest) {
  return [
    "minarvabiz-update-v1",
    manifest.product,
    manifest.version,
    manifest.installerUrl,
    manifest.sha256.toLowerCase(),
    manifest.publishedAt,
  ].join("\n");
}

function isTrustedInstallerUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:"
      && url.hostname.toLowerCase() === "github.com"
      && url.pathname.startsWith("/evertekitsolutions-del/minarvabiz/releases/download/")
      && /\/MinarvaBiz-Setup-[0-9A-Za-z.+-]+\.exe$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function validateManifest(value: unknown): UpdateManifest | null {
  const m = value as Partial<UpdateManifest>;
  if (m.product !== "minarvabiz" || !m.version || !m.installerUrl || !m.sha256 || !m.publishedAt || !m.signature) return null;
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(m.version)) return null;
  if (!isTrustedInstallerUrl(m.installerUrl)) return null;
  if (!/^[0-9a-f]{64}$/i.test(m.sha256)) return null;
  if (!Number.isFinite(new Date(m.publishedAt).getTime())) return null;
  return m as UpdateManifest;
}

function verifyManifestSignature(manifest: UpdateManifest, publicKeyHex: string) {
  try {
    if (!/^[0-9a-f]{64}$/.test(publicKeyHex)) return false;
    const publicKey = createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), hexToBytes(publicKeyHex)]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(canonicalManifest(manifest), "utf8"), publicKey, fromBase64Url(manifest.signature));
  } catch {
    return false;
  }
}

function numericParts(version: string) {
  return version.split("-", 1)[0].split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function isNewerVersion(candidate: string, current: string) {
  const a = numericParts(candidate);
  const b = numericParts(current);
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

export async function checkForSecureUpdate(currentVersion: string): Promise<UpdateCheckResult> {
  const { manifestUrl, publicKeyHex } = config();
  verifiedManifest = null;
  downloadedInstaller = null;
  if (!manifestUrl || !publicKeyHex) return { status: "disabled", currentVersion };
  if (!/^https:\/\//i.test(manifestUrl) || !/^[0-9a-f]{64}$/.test(publicKeyHex)) {
    return { status: "error", currentVersion, error: "Secure update channel configuration is invalid." };
  }
  try {
    const response = await fetch(manifestUrl, {
      headers: { accept: "application/json", "cache-control": "no-cache" },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return { status: "error", currentVersion, error: `Update server returned HTTP ${response.status}.` };
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > 64 * 1024) return { status: "error", currentVersion, error: "Update manifest is too large." };
    const manifest = validateManifest(JSON.parse(text));
    if (!manifest) return { status: "error", currentVersion, error: "Update manifest is malformed." };
    if (!verifyManifestSignature(manifest, publicKeyHex)) return { status: "error", currentVersion, error: "Update manifest signature verification failed." };
    if (!isNewerVersion(manifest.version, currentVersion)) {
      return { status: "up_to_date", currentVersion, version: manifest.version, publishedAt: manifest.publishedAt, notes: manifest.notes };
    }
    verifiedManifest = manifest;
    return { status: "available", currentVersion, version: manifest.version, publishedAt: manifest.publishedAt, notes: manifest.notes };
  } catch (e) {
    return { status: "error", currentVersion, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function downloadVerifiedUpdate(userDataDir: string): Promise<UpdateDownloadResult> {
  const manifest = verifiedManifest;
  if (!manifest) return { ok: false, error: "Check for updates before downloading." };
  try {
    const response = await fetch(manifest.installerUrl, { signal: AbortSignal.timeout(120000) });
    if (!response.ok || !response.body) return { ok: false, error: `Installer download failed with HTTP ${response.status}.` };
    const declared = Number(response.headers.get("content-length") || 0);
    const maxBytes = 500 * 1024 * 1024;
    if (declared > maxBytes) return { ok: false, error: "Installer is larger than the allowed update size." };
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength <= 0 || arrayBuffer.byteLength > maxBytes) return { ok: false, error: "Downloaded installer size is invalid." };
    const bytes = Buffer.from(arrayBuffer);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== manifest.sha256.toLowerCase()) return { ok: false, error: "Installer SHA-256 verification failed." };

    const updateDir = path.join(userDataDir, "updates");
    fs.mkdirSync(updateDir, { recursive: true });
    const target = path.join(updateDir, `MinarvaBiz-Setup-${manifest.version}.exe`);
    const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(temp, bytes);
    fs.renameSync(temp, target);
    downloadedInstaller = { version: manifest.version, path: target, sha256: digest };
    return { ok: true, version: manifest.version, installerPath: target };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function getDownloadedVerifiedUpdate() {
  if (!downloadedInstaller || !fs.existsSync(downloadedInstaller.path)) return null;
  try {
    const digest = createHash("sha256").update(fs.readFileSync(downloadedInstaller.path)).digest("hex");
    return digest === downloadedInstaller.sha256 ? { ...downloadedInstaller } : null;
  } catch {
    return null;
  }
}
