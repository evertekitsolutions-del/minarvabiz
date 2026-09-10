/** WhatsApp deep-link launcher (no third-party API required) */
function normalizeWhatsAppNumber(phone: string): string {
  const raw = String(phone || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return digits;
  if (raw.startsWith("00") && digits.length > 2) return digits.slice(2);
  return digits.length === 10 ? `91${digits}` : digits;
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const withCountry = normalizeWhatsAppNumber(phone);
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

export function openWhatsApp(phone: string, message: string): void {
  if (typeof window === "undefined") return;
  window.open(buildWhatsAppUrl(phone, message), "_blank", "noopener,noreferrer");
}
