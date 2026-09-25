export const LICENSE_STATUS_ACTIONS = [
  "active",
  "suspended",
  "revoked",
  "deactivated",
] as const;

export type LicenseStatusAction = (typeof LICENSE_STATUS_ACTIONS)[number];

export function isLicenseStatusAction(value: unknown): value is LicenseStatusAction {
  return typeof value === "string" && LICENSE_STATUS_ACTIONS.includes(value as LicenseStatusAction);
}

export interface OfflineActivationPackageInput {
  licenseToken: string;
  activationCertificate: string;
  licenseId: string;
  activationId: string;
  deviceId: string;
  issuedAt: string;
  expiresAt: string | null;
}

export function buildOfflineActivationPackage(input: OfflineActivationPackageInput) {
  return {
    format: "minarvabiz-license-v1" as const,
    product: "minarvabiz" as const,
    licenseToken: input.licenseToken,
    activationCertificate: input.activationCertificate,
    licenseId: input.licenseId,
    activationId: input.activationId,
    deviceId: input.deviceId,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  };
}
