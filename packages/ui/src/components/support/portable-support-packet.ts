/**
 * Explicit, user-controlled portability path for an offline support request.
 * No network traffic, paid AI dependency, or automatic submission.
 */
export type SupportPacketType = "technical_escalation" | "feature_request" | "suggestion";

export interface PortableSupportRequest {
  type: SupportPacketType;
  title: string;
  description: string;
  module?: string;
  priority?: "low" | "normal" | "high";
  contactEmail?: string;
  transcript?: Array<{ role: "user" | "assistant"; content: string }>;
  image?: string | null;
  context: {
    appVersion?: string;
    edition?: string;
    platform?: string;
    module?: string;
    organizationName?: string;
    diagnostics?: Record<string, unknown> | null;
  };
}

export const SUPPORT_PACKET_FORMAT = "minarvabiz.support.v1";
export const SUPPORT_PACKET_MAX_BYTES = 3_000_000;

export function createPortableSupportPacket(data: PortableSupportRequest, now = new Date()): string {
  if (!["technical_escalation", "feature_request", "suggestion"].includes(data.type)) {
    throw new Error("Unsupported request type.");
  }
  const title = data.title.trim();
  const description = data.description.trim();
  if (!title || title.length > 200 || !description || description.length > 64_000) {
    throw new Error("A title and description are required for the support request.");
  }
  if (data.image && (!data.image.startsWith("data:image/jpeg;base64,") || data.image.length > 2_600_000)) {
    throw new Error("Screenshot is not a valid compressed image.");
  }
  if (data.transcript && (
    data.transcript.length > 30 ||
    data.transcript.some(m => !["assistant", "user"].includes(m.role) || typeof m.content !== "string" || m.content.length > 4_000)
  )) throw new Error("Conversation exceeds the safe support packet size.");
  const packet = {
    format: SUPPORT_PACKET_FORMAT,
    createdAt: now.toISOString(),
    type: data.type,
    title,
    description,
    module: data.module?.trim().slice(0, 120) || "",
    priority: data.priority || "normal",
    contactEmail: data.contactEmail?.trim().slice(0, 320) || "",
    transcript: data.transcript || [],
    image: data.image || null,
    context: {
      appVersion: data.context.appVersion || "",
      edition: data.context.edition || "",
      platform: data.context.platform || "",
      module: data.context.module || "",
      organizationName: data.context.organizationName || "",
      // Diagnostics are included only if the operator selected the existing
      // "Share redacted diagnostics" checkbox.
      diagnostics: data.context.diagnostics ?? null,
    },
  };
  const result = JSON.stringify(packet, null, 2);
  if (new TextEncoder().encode(result).byteLength > SUPPORT_PACKET_MAX_BYTES) {
    throw new Error("Support request is too large. Remove the screenshot or shorten the conversation.");
  }
  return result;
}

export function canUseSupportApi(apiBaseUrl: string, isDesktop: boolean): boolean {
  const base = apiBaseUrl.trim();
  if (!base) return !isDesktop;
  try {
    const url = new URL(base);
    return url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost");
  } catch {
    return false;
  }
}
