/** Classifies a Supabase signup result without treating HTTP 200 as delivered email. */
export function signupDisposition(data: {
  session?: unknown | null;
  user?: { identities?: readonly unknown[] | null } | null;
}): "signed_in" | "possible_existing_account" | "awaiting_verification" {
  if (data.session) return "signed_in";
  // A repeated signup for an already-confirmed email may return HTTP 200
  // with an obfuscated user object and an empty identities array.
  if (Array.isArray(data.user?.identities) && data.user.identities.length === 0) {
    return "possible_existing_account";
  }
  return "awaiting_verification";
}

export function signupErrorMessage(error: { code?: string; message?: string }): string {
  if (error.code === "email_address_not_authorized") {
    return "Verification email cannot be delivered to this address with the current email service. Please contact Minarva Biz support; do not retry repeatedly.";
  }
  if (error.code === "over_email_send_rate_limit" || /email rate limit exceeded/i.test(error.message ?? "")) {
    return "Verification email service has reached its rate limit. Please contact Minarva Biz support rather than submitting repeated registrations.";
  }
  if (/user already registered/i.test(error.message ?? "")) {
    return "This address may already have an account. Sign in using the original password, or request password recovery.";
  }
  return error.message || "Registration failed. Please retry.";
}
