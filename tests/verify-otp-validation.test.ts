import { describe, expect, it } from "vitest";
import {
  OTP_TOKEN_LENGTH,
  validateOtpInput,
} from "@/lib/auth/verify-otp-validation";

describe("validateOtpInput", () => {
  it("accepts a clean (email, 6-digit token) pair", () => {
    const result = validateOtpInput({
      email: "owner@example.com",
      token: "123456",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        email: "owner@example.com",
        token: "123456",
      });
    }
  });

  it("normalizes email casing and surrounding whitespace", () => {
    const result = validateOtpInput({
      email: "  Owner@Example.COM  ",
      token: "123456",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBe("owner@example.com");
    }
  });

  it("trims whitespace around the token", () => {
    const result = validateOtpInput({
      email: "owner@example.com",
      token: "  654321 ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.token).toBe("654321");
    }
  });

  it("rejects an empty email", () => {
    const result = validateOtpInput({ email: "", token: "123456" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/邮箱/);
  });

  it("rejects a missing email key entirely", () => {
    const result = validateOtpInput({ token: "123456" });
    expect(result.ok).toBe(false);
  });

  it("rejects malformed emails (no @)", () => {
    const result = validateOtpInput({
      email: "owner.example.com",
      token: "123456",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/格式/);
  });

  it("rejects a missing token", () => {
    const result = validateOtpInput({ email: "owner@example.com", token: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/验证码/);
  });

  it("rejects a too-short token", () => {
    const result = validateOtpInput({
      email: "owner@example.com",
      token: "12345",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(new RegExp(`${OTP_TOKEN_LENGTH}`));
  });

  it("rejects a token with non-digit characters", () => {
    const result = validateOtpInput({
      email: "owner@example.com",
      token: "12a456",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a too-long token", () => {
    const result = validateOtpInput({
      email: "owner@example.com",
      token: "1234567",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects null and undefined inputs gracefully", () => {
    expect(
      validateOtpInput({ email: null, token: "123456" }).ok,
    ).toBe(false);
    expect(
      validateOtpInput({ email: "owner@example.com", token: null }).ok,
    ).toBe(false);
    expect(validateOtpInput({}).ok).toBe(false);
  });
});
