const DEFAULT_LICENSE_EDGE_URL = "https://minarva-biz-license-edge.minarva-biz.workers.dev";

function validEdgeOrigin(value: string) {
  try {
    const url = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return "";
    if (url.username || url.password || url.search || url.hash) return "";
    return url.origin;
  } catch {
    return "";
  }
}

/**
 * Client-safe License Edge origin.
 *
 * NEXT_PUBLIC_LICENSE_EDGE_URL is intentionally public configuration, never a
 * credential. HTTPS is required remotely; HTTP is accepted only on loopback.
 * The current Cloudflare endpoint is a transition default so existing static
 * deployments keep working while the same artifact can target a future
 * Minarva-owned/self-hosted edge without source changes.
 */
export function licenseEdgeOrigin() {
  const configured = String(process.env.NEXT_PUBLIC_LICENSE_EDGE_URL || "").trim();
  return validEdgeOrigin(configured) || DEFAULT_LICENSE_EDGE_URL;
}
