import { sha256 } from "@minarvabiz/utils";
import type { DeviceFingerprint } from "@minarvabiz/types";

export async function collectFingerprint(extra?: Record<string, string>): Promise<DeviceFingerprint> {
  const parts: string[] = [];
  const platform = typeof process !== "undefined" && process.platform ? process.platform : typeof navigator !== "undefined" ? navigator.platform : "unknown";
  parts.push(`platform:${platform}`);
  if (typeof navigator !== "undefined") { parts.push(`ua:${navigator.userAgent}`); parts.push(`lang:${navigator.language}`); }
  if (extra) for (const [k, v] of Object.entries(extra)) if (v) parts.push(`${k}:${v}`);
  parts.sort();
  const hash = await sha256(parts.join("|"));
  return { hash, platform, osVersion: extra?.osVersion, collectedAt: new Date().toISOString() };
}

export async function collectDesktopFingerprint(hw: {
  cpuModel?: string; diskSerial?: string; macAddress?: string; windowsProductId?: string; hostname?: string; osVersion?: string;
}): Promise<DeviceFingerprint> {
  return collectFingerprint({ cpu: hw.cpuModel ?? "", disk: hw.diskSerial ?? "", mac: hw.macAddress ?? "", winpid: hw.windowsProductId ?? "", host: hw.hostname ?? "", osVersion: hw.osVersion ?? "" });
}
