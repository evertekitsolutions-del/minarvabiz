/** Production Auth emails must never inherit a localhost/preview origin. */
export const PRODUCTION_AUTH_ORIGIN = "https://minarvabiz.com" as const;
export type AuthEmailDestination = "/reset-password" | "/register/complete";

export function authEmailRedirectUrl(
  destination: AuthEmailDestination,
  browserOrigin: string,
  production = process.env.NODE_ENV === "production",
): string {
  if (production) return PRODUCTION_AUTH_ORIGIN + destination;
  // Even in local development, an explicit production browser host is canonical.
  const url = new URL(browserOrigin);
  if (url.hostname === "minarvabiz.com" || url.hostname === "www.minarvabiz.com") {
    return PRODUCTION_AUTH_ORIGIN + destination;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Invalid authentication callback origin.");
  }
  return url.origin + destination;
}
