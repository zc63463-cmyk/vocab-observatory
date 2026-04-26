import { describe, expect, it } from "vitest";
import {
  readDesiredRetentionSetting,
  writeDesiredRetentionSetting,
} from "@/lib/review/settings";

describe("review settings", () => {
  it("reads desired retention from nested profile settings", () => {
    expect(
      readDesiredRetentionSetting({
        review: {
          desired_retention: 0.95,
        },
      }),
    ).toBe(0.95);
  });

  it("falls back to the default retention when settings are missing", () => {
    expect(readDesiredRetentionSetting(null)).toBe(0.9);
    expect(readDesiredRetentionSetting({})).toBe(0.9);
  });

  it("merges desired retention without dropping unrelated settings", () => {
    expect(
      writeDesiredRetentionSetting(
        {
          appearance: {
            theme: "dark",
          },
          review: {
            desired_retention: 0.8,
          },
        },
        0.93,
      ),
    ).toEqual({
      appearance: {
        theme: "dark",
      },
      review: {
        desired_retention: 0.93,
      },
    });
  });
});
