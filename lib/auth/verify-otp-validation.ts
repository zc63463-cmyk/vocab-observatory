// Pure validators for the verify-otp route. Extracted so unit tests can
// exercise every shape without mocking NextRequest / Supabase clients.
//
// Supabase's email OTP is a 6-digit numeric token (configurable but we rely
// on the default since we never override it server-side). Anything outside
// that shape we reject early — saves a network round-trip and gives the
// user a clearer error than Supabase's generic "Invalid OTP" message.

export interface OtpInput {
  email?: string | null;
  token?: string | null;
}

export interface OtpInputValid {
  email: string;
  token: string;
}

export type ValidateResult =
  | { ok: true; value: OtpInputValid }
  | { ok: false; error: string };

/** Default Supabase email OTP length. */
export const OTP_TOKEN_LENGTH = 6;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_RE = /^\d{6}$/;

export function validateOtpInput(input: OtpInput): ValidateResult {
  const rawEmail = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const rawToken = typeof input.token === "string" ? input.token.trim() : "";

  if (!rawEmail) {
    return { ok: false, error: "请输入邮箱。" };
  }
  if (!EMAIL_RE.test(rawEmail)) {
    return { ok: false, error: "邮箱格式不正确。" };
  }
  if (!rawToken) {
    return { ok: false, error: "请输入验证码。" };
  }
  if (!TOKEN_RE.test(rawToken)) {
    return {
      ok: false,
      error: `验证码必须为 ${OTP_TOKEN_LENGTH} 位数字。`,
    };
  }

  return { ok: true, value: { email: rawEmail, token: rawToken } };
}
