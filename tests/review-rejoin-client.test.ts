import { describe, expect, it, vi } from "vitest";
import { submitReviewRejoin } from "@/lib/review/rejoin-client";

function buildResponse(
  body: unknown,
  init: { ok?: boolean; status?: number; jsonThrows?: boolean } = {},
): Response {
  const ok = init.ok ?? true;
  const status = init.status ?? (ok ? 200 : 400);
  return {
    ok,
    status,
    json: init.jsonThrows
      ? () => Promise.reject(new SyntaxError("Unexpected end of JSON input"))
      : () => Promise.resolve(body),
  } as unknown as Response;
}

describe("submitReviewRejoin", () => {
  it("posts to /api/review/rejoin with the correct body and headers", async () => {
    const fetchMock: typeof fetch = vi.fn(async () =>
      buildResponse({ ok: true, progress: { id: "abc" } }),
    );

    await submitReviewRejoin("progress-123", fetchMock);

    const calls = (fetchMock as unknown as { mock: { calls: Parameters<typeof fetch>[] } }).mock.calls;
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0];
    expect(url).toBe("/api/review/rejoin");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      progressId: "progress-123",
    });
  });

  it("returns ok=true only when HTTP 2xx AND payload.ok===true", async () => {
    const fetchMock = vi.fn(async () => buildResponse({ ok: true }));
    const result = await submitReviewRejoin("p1", fetchMock);
    expect(result).toEqual({ ok: true });
  });

  it("returns ok=false with default message when HTTP 2xx but payload.ok is missing", async () => {
    const fetchMock = vi.fn(async () => buildResponse({ progress: {} }));
    const result = await submitReviewRejoin("p1", fetchMock);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe("立即复习失败");
  });

  it("uses payload.error string when present on failure", async () => {
    const fetchMock = vi.fn(async () =>
      buildResponse({ error: "找不到该词条" }, { ok: false, status: 404 }),
    );
    const result = await submitReviewRejoin("p1", fetchMock);
    expect(result).toEqual({ ok: false, errorMessage: "找不到该词条" });
  });

  it("falls back to default message when payload.error is not a string (e.g. zod flatten)", async () => {
    const zodFlatten = {
      formErrors: [],
      fieldErrors: { progressId: ["Invalid uuid"] },
    };
    const fetchMock = vi.fn(async () =>
      buildResponse({ error: zodFlatten }, { ok: false, status: 400 }),
    );
    const result = await submitReviewRejoin("p1", fetchMock);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe("立即复习失败");
    // Critical: never expose [object Object] to users
    expect(result.errorMessage).not.toContain("[object");
  });

  it("returns ok=false with default message when JSON parsing fails", async () => {
    const fetchMock = vi.fn(async () =>
      buildResponse(null, { jsonThrows: true, ok: false, status: 500 }),
    );
    const result = await submitReviewRejoin("p1", fetchMock);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe("立即复习失败");
  });

  it("returns ok=false using thrown error message when fetch rejects (network down)", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("Failed to fetch");
    });
    const result = await submitReviewRejoin("p1", fetchMock);
    expect(result).toEqual({ ok: false, errorMessage: "Failed to fetch" });
  });

  it("returns default message when fetch rejects with a non-Error value", async () => {
    const fetchMock = vi.fn(async () => {
      throw "some-string-rejection";
    });
    const result = await submitReviewRejoin("p1", fetchMock);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe("立即复习失败");
  });

  it("treats null payload as failure (no ok flag)", async () => {
    const fetchMock = vi.fn(async () => buildResponse(null));
    const result = await submitReviewRejoin("p1", fetchMock);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe("立即复习失败");
  });

  it("does not treat HTTP 200 with payload.ok=false as success", async () => {
    const fetchMock = vi.fn(async () =>
      buildResponse({ ok: false, error: "Suspended word" }),
    );
    const result = await submitReviewRejoin("p1", fetchMock);
    expect(result).toEqual({ ok: false, errorMessage: "Suspended word" });
  });
});
