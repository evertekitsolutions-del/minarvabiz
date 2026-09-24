export type MinarvaSecurityHeader = {
  key: string;
  value: string;
};

const HTTP_SECURITY_HEADER_BASELINE: readonly MinarvaSecurityHeader[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

export function minarvaHttpSecurityHeaders(): MinarvaSecurityHeader[] {
  return HTTP_SECURITY_HEADER_BASELINE.map((header) => ({ ...header }));
}

export type MinarvaNonceCspOptions = {
  nonce: string;
  environment?: string;
  connectSources?: readonly string[];
  imageSources?: readonly string[];
  workerSources?: readonly string[];
  manifestSources?: readonly string[];
};

function uniqueSources(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean)));
}

export function buildMinarvaNonceCsp(options: MinarvaNonceCspOptions): string {
  const nonce = String(options.nonce || "").trim();
  if (!nonce) throw new Error("CSP nonce is required");

  const environment = String(options.environment || "").trim().toLowerCase();
  const developmentScriptPolicy = environment === "development" ? " 'unsafe-eval'" : "";
  const connectSources = uniqueSources(["'self'", ...(options.connectSources || [])]);
  const imageSources = uniqueSources(["'self'", "data:", "blob:", ...(options.imageSources || [])]);

  const directives = [
    "default-src 'self'",
    "script-src 'self' 'nonce-" + nonce + "' 'strict-dynamic'" + developmentScriptPolicy,
    "style-src 'self' 'unsafe-inline'",
    "img-src " + imageSources.join(" "),
    "font-src 'self' data:",
    "connect-src " + connectSources.join(" "),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  const workerSources = uniqueSources(options.workerSources || []);
  if (workerSources.length) directives.push("worker-src " + workerSources.join(" "));

  const manifestSources = uniqueSources(options.manifestSources || []);
  if (manifestSources.length) directives.push("manifest-src " + manifestSources.join(" "));

  if (environment === "production") directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
