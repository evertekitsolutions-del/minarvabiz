/** Native support export validation. Only a deliberate Save dialog writes a file. */
export const MAX_SUPPORT_PACKET_BYTES = 3_000_000;
const FORMAT = "minarvabiz.support.v1";
const TYPES = new Set(["technical_escalation", "feature_request", "suggestion"]);
const TOP_LEVEL_KEYS = new Set([
  "format", "createdAt", "type", "title", "description", "module",
  "priority", "contactEmail", "transcript", "image", "context",
]);

export function validateSupportPacketForExport(raw: unknown): string {
  if (typeof raw !== "string" || !raw || Buffer.byteLength(raw, "utf8") > MAX_SUPPORT_PACKET_BYTES) {
    throw new Error("Support packet is missing or exceeds the 3 MB limit.");
  }
  let packet: Record<string, unknown>;
  try { packet = JSON.parse(raw) as Record<string, unknown>; }
  catch { throw new Error("Support packet is not valid JSON."); }
  if (!packet || Array.isArray(packet) || typeof packet !== "object" ||
      Object.keys(packet).some(key => !TOP_LEVEL_KEYS.has(key)) ||
      packet.format !== FORMAT || !TYPES.has(String(packet.type))) {
    throw new Error("Unsupported support packet format.");
  }
  if (typeof packet.title !== "string" || packet.title.trim().length < 1 || packet.title.length > 200 ||
      typeof packet.description !== "string" || packet.description.trim().length < 1 || packet.description.length > 64_000) {
    throw new Error("Support packet needs a valid title and description.");
  }
  if (typeof packet.createdAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(packet.createdAt) ||
      Number.isNaN(Date.parse(packet.createdAt))) {
    throw new Error("Support packet timestamp is invalid.");
  }
  if (!packet.context || Array.isArray(packet.context) || typeof packet.context !== "object") {
    throw new Error("Support packet context is invalid.");
  }
  if (packet.image !== null && packet.image !== undefined &&
      (typeof packet.image !== "string" ||
       !packet.image.startsWith("data:image/jpeg;base64,") ||
       packet.image.length > 2_600_000)) {
    throw new Error("Support screenshot exceeds allowed size or format.");
  }
  if (packet.transcript !== undefined && (!Array.isArray(packet.transcript) || packet.transcript.length > 30 ||
      packet.transcript.some((item: unknown) => !item || typeof item !== "object" ||
        !["assistant", "user"].includes((item as {role?: string}).role || "") ||
        typeof (item as {content?: unknown}).content !== "string" ||
        ((item as {content: string}).content.length > 4_000)))) {
    throw new Error("Support transcript is invalid.");
  }
  return raw;
}
