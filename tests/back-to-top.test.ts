import { describe, expect, it } from "vitest";
import {
  BACK_TO_TOP_SCROLL_OPTIONS,
  BACK_TO_TOP_VISIBILITY_THRESHOLD,
  shouldShowBackToTop,
} from "@/lib/back-to-top";

describe("back-to-top helpers", () => {
  it("only shows the button after the configured threshold", () => {
    expect(shouldShowBackToTop(BACK_TO_TOP_VISIBILITY_THRESHOLD - 1)).toBe(false);
    expect(shouldShowBackToTop(BACK_TO_TOP_VISIBILITY_THRESHOLD)).toBe(false);
    expect(shouldShowBackToTop(BACK_TO_TOP_VISIBILITY_THRESHOLD + 1)).toBe(true);
  });

  it("uses smooth scroll back to the page top", () => {
    expect(BACK_TO_TOP_SCROLL_OPTIONS).toEqual({ behavior: "smooth", top: 0 });
  });
});
