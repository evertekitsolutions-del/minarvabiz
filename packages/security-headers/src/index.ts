export type SecurityHeader = {
  key: string;
  value: string;
};

export const SECURITY_HEADERS: readonly SecurityHeader[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
] as const;

export type NonceCspOptions = {
  nonce: string;
  development?: boolean;
  production?: boolean;
  connectSources?: readonly string[];
  imageSources?: readonly string[];
  workerSources?: readonly string[];
  manifestSources?: readonly string[];
};

function uniqueSources(sources: readonly string[]): string[] {
  return Array.from(new Set(sources.map((source) => String(source || "").trim()).filter(Boolean)));
}

export function createCspNonce(): string {
  return btoa(crypto.randomUUID());
}

export function buildNonceCsp(options: NonceCspOptions): string {
  const nonce = String(options.nonce || "").trim();
  if (!nonce || !/^[A-Za-z0-9+/_=-]+$/.test(nonce)) {
    throw new Error("A valid CSP nonce is required.");
  }

  const connectSources = uniqueSources(options.connectSources || ["'self'"]);
  const imageSources = uniqueSources(options.imageSources || ["'self'", "data:", "blob:"]);
  const workerSources = uniqueSources(options.workerSources || []);
  const manifestSources = uniqueSources(options.manifestSources || []);

  const scriptSources = ["'self'", "'nonce-" + nonce + "'", "'strict-dynamic'"];
  if (options.development) scriptSources.push("'unsafe-eval'");

  const directives = [
    "default-src 'self'",
    "script-src " + scriptSources.join(" "),
    "style-src 'self' 'unsafe-inline'",
    "img-src " + imageSources.join(" "),
    "font-src 'self' data:",
    "connect-src " + connectSources.join(" "),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  if (workerSources.length) directives.push("worker-src " + workerSources.join(" "));
  if (manifestSources.length) directives.push("manifest-src " + manifestSources.join(" "));
  if (options.production) directives.push("upgrade-insecure-requests");

  return directives.join("; ");
}
