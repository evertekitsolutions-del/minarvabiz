/** Accept legacy untyped recovery URLs, but deny every explicitly non-recovery purpose. */
export function isRecoveryPurpose(hashPurpose: string | null, queryPurpose: string | null): boolean {
  return [hashPurpose, queryPurpose].every((purpose) => purpose === null || purpose === "recovery");
}
