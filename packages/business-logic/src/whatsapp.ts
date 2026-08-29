/** WhatsApp deep-link launcher (no third-party API required) */
export function buildWhatsAppUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  const withCountry = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

export function openWhatsApp(phone: string, message: string): void {
  if (typeof window === "undefined") return;
  window.open(buildWhatsAppUrl(phone, message), "_blank", "noopener,noreferrer");
}
