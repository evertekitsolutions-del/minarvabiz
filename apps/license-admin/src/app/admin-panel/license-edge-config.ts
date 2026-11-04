const DEFAULT_LICENSE_EDGE_URL = "https://minarva-biz-license-edge.anilalbert7.workers.dev";

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
 * The account-owned Cloudflare Workers subdomain is the transition default so existing static
 * deployments keep working while the same artifact can target a future
 * Minarva-owned/self-hosted edge without source changes.
 */
/**
 * The production Admin Pages deployment is owned by a different Cloudflare
 * account than the licensing Worker. Its build environment may still contain
 * a legacy NEXT_PUBLIC_LICENSE_EDGE_URL pointing at a non-existent Worker.
 * Pin the known Admin site to the verified licensing Worker. Other sites
 * preserve the documented configurable self-host migration path.
 */
export function licenseEdgeOrigin() {
  const host = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
  if (
    host === "minarvabiz-license-admin.pages.dev" ||
    host === "minarvabiz-license-admin-anil.pages.dev"
  ) return DEFAULT_LICENSE_EDGE_URL;
  const configured = String(process.env.NEXT_PUBLIC_LICENSE_EDGE_URL || "").trim();
  return validEdgeOrigin(configured) || DEFAULT_LICENSE_EDGE_URL;
}
