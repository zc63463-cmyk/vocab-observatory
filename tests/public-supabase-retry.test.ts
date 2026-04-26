import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTransientPublicReadRetry } from "@/lib/supabase/public";

describe("public supabase retry helper", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("retries once on a transient read error and then succeeds", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("TypeError: terminated"))
      .mockResolvedValueOnce("ok");

    const promise = withTransientPublicReadRetry("word detail slug \"abandon\"", operation);

    await Promise.resolve();
    expect(operation).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(250);

    await expect(promise).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("does not retry a non-transient error", async () => {
    const error = new Error("permission denied");
    const operation = vi.fn<() => Promise<string>>().mockRejectedValue(error);

    await expect(
      withTransientPublicReadRetry("word detail slug \"abandon\"", operation),
    ).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("returns immediately on first success", async () => {
    const operation = vi.fn<() => Promise<string>>().mockResolvedValue("ok");

    await expect(
      withTransientPublicReadRetry("plaza detail slug \"root-ab-abs\"", operation),
    ).resolves.toBe("ok");

    expect(operation).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
  });
});
