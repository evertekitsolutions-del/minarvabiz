const GOOGLE_REVIEW_HOSTS = new Set([
  "g.page",
  "google.com",
  "www.google.com",
  "maps.google.com",
  "search.google.com",
  "maps.app.goo.gl",
]);

/** Only allow verified Google HTTPS links in customer review requests. */
export function parseGoogleReviewUrl(raw: string): string {
  const input = raw.trim();
  if (!input) return "";
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Enter a valid Google review HTTPS URL.");
  }
  if (url.protocol !== "https:" || !GOOGLE_REVIEW_HOSTS.has(url.hostname.toLowerCase()) ||
      url.username || url.password || url.port) {
    throw new Error("Google review link must use an official Google HTTPS domain.");
  }
  return url.toString();
}
