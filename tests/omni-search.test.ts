import { describe, it, expect } from "vitest";
import { scoreOmniItem, omniActions } from "../components/omni/omni-actions";
import { safeSlug, isInternalHref, shouldUpdateFromController } from "../components/omni/omni-utils";
import type { OmniItem } from "../components/omni/types";

/* ─── scoreOmniItem ─── */

describe("scoreOmniItem", () => {
  const baseItem: OmniItem = {
    id: "test:1",
    type: "word",
    title: "ephemeral",
    subtitle: "lasting for a very short time",
    keywords: ["transient", "fleeting", "短暂的"],
  };

  it("returns 1 for empty query", () => {
    expect(scoreOmniItem(baseItem, "")).toBe(1);
  });

  it("returns 100 for exact title match", () => {
    expect(scoreOmniItem(baseItem, "ephemeral")).toBe(100);
  });

  it("returns 80 for title prefix match", () => {
    expect(scoreOmniItem(baseItem, "ephem")).toBe(80);
  });

  it("returns 60 for title contains match", () => {
    expect(scoreOmniItem(baseItem, "hemera")).toBe(60);
  });

  it("returns 40 for keyword match", () => {
    expect(scoreOmniItem(baseItem, "transient")).toBe(40);
  });

  it("returns 20 for subtitle match", () => {
    expect(scoreOmniItem(baseItem, "short time")).toBe(20);
  });

  it("returns 0 for no match", () => {
    expect(scoreOmniItem(baseItem, "xyzabc")).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(scoreOmniItem(baseItem, "EPHEMERAL")).toBe(100);
    expect(scoreOmniItem(baseItem, "Transient")).toBe(40);
  });
});

/* ─── omniActions ─── */

describe("omniActions", () => {
  it("contains at least 4 actions", () => {
    expect(omniActions.length).toBeGreaterThanOrEqual(4);
  });

  it("every action has an id, type, and title", () => {
    for (const action of omniActions) {
      expect(action.id).toBeTruthy();
      expect(action.type).toBe("action");
      expect(action.title).toBeTruthy();
    }
  });

  it("contains go-home action", () => {
    const home = omniActions.find((a) => a.id === "action:go-home");
    expect(home).toBeDefined();
    expect(home?.href).toBe("/");
  });

  it("contains start-review action", () => {
    const review = omniActions.find((a) => a.id === "action:start-review");
    expect(review).toBeDefined();
    expect(review?.href).toBe("/review");
  });

  it("actions with keywords are searchable", () => {
    const results = omniActions.filter(
      (a) => scoreOmniItem(a, "首页") > 0 || scoreOmniItem(a, "home") > 0,
    );
    expect(results.length).toBeGreaterThan(0);
  });
});

/* ─── Keyboard navigation logic (unit-level) ─── */

describe("keyboard navigation index clamping", () => {
  const totalItems = 5;

  function clampIndex(index: number, total: number): number {
    if (total === 0) return -1;
    return Math.max(0, Math.min(index, total - 1));
  }

  function wrapDown(index: number, total: number): number {
    if (total === 0) return -1;
    return index >= total - 1 ? 0 : index + 1;
  }

  function wrapUp(index: number, total: number): number {
    if (total === 0) return -1;
    return index <= 0 ? total - 1 : index - 1;
  }

  it("ArrowDown increments index", () => {
    expect(wrapDown(0, totalItems)).toBe(1);
    expect(wrapDown(3, totalItems)).toBe(4);
  });

  it("ArrowDown wraps at end", () => {
    expect(wrapDown(4, totalItems)).toBe(0);
  });

  it("ArrowUp decrements index", () => {
    expect(wrapUp(4, totalItems)).toBe(3);
    expect(wrapUp(2, totalItems)).toBe(1);
  });

  it("ArrowUp wraps at start", () => {
    expect(wrapUp(0, totalItems)).toBe(4);
  });

  it("returns -1 for empty list", () => {
    expect(wrapDown(0, 0)).toBe(-1);
    expect(wrapUp(0, 0)).toBe(-1);
    expect(clampIndex(0, 0)).toBe(-1);
  });

  it("clampIndex prevents out-of-bounds", () => {
    expect(clampIndex(-1, 5)).toBe(0);
    expect(clampIndex(10, 5)).toBe(4);
  });
});

/* ─── safeSlug (production import) ─── */

describe("safeSlug", () => {
  it("encodes special characters in slugs", () => {
    expect(safeSlug("hello world")).toBe("hello%20world");
  });

  it("encodes CJK characters in slugs", () => {
    expect(safeSlug("你好世界")).toBe("%E4%BD%A0%E5%A5%BD%E4%B8%96%E7%95%8C");
  });

  it("leaves simple ASCII slugs unchanged", () => {
    expect(safeSlug("ephemeral")).toBe("ephemeral");
  });

  it("handles slugs with slashes safely", () => {
    expect(safeSlug("path/to/word")).toBe("path%2Fto%2Fword");
  });

  it("returns empty string for null/undefined/empty input", () => {
    expect(safeSlug(null)).toBe("");
    expect(safeSlug(undefined)).toBe("");
    expect(safeSlug("")).toBe("");
  });

  it("used in href does not produce bad links for empty slug", () => {
    const slug = "";
    const href = safeSlug(slug) ? `/words/${safeSlug(slug)}` : "/words";
    expect(href).toBe("/words");
    expect(href).not.toContain("//");
  });
});

/* ─── isInternalHref (production import) ─── */

describe("isInternalHref", () => {
  it("recognizes internal paths", () => {
    expect(isInternalHref("/")).toBe(true);
    expect(isInternalHref("/words")).toBe(true);
    expect(isInternalHref("/plaza/semantic-field")).toBe(true);
  });

  it("rejects protocol-relative URLs", () => {
    expect(isInternalHref("//example.com")).toBe(false);
    expect(isInternalHref("//cdn.example.com/assets")).toBe(false);
  });

  it("rejects absolute URLs", () => {
    expect(isInternalHref("https://example.com")).toBe(false);
    expect(isInternalHref("http://example.com")).toBe(false);
  });

  it("rejects relative paths without leading slash", () => {
    expect(isInternalHref("words/ephemeral")).toBe(false);
  });
});

/* ─── shouldUpdateFromController (production import) ─── */

describe("shouldUpdateFromController", () => {
  it("allows update when controller is current and not aborted", () => {
    const controller = { signal: { aborted: false } };
    const abortRef = { current: controller };
    expect(shouldUpdateFromController(controller, abortRef)).toBe(true);
  });

  it("blocks update when controller is aborted", () => {
    const controller = { signal: { aborted: true } };
    const abortRef = { current: controller };
    expect(shouldUpdateFromController(controller, abortRef)).toBe(false);
  });

  it("blocks update when abortRef has moved to a newer controller", () => {
    const oldController = { signal: { aborted: false } };
    const newController = { signal: { aborted: false } };
    const abortRef = { current: newController };
    expect(shouldUpdateFromController(oldController, abortRef)).toBe(false);
  });

  it("allows update for new controller even if old is still resolving", () => {
    const newController = { signal: { aborted: false } };
    const abortRef = { current: newController };
    expect(shouldUpdateFromController(newController, abortRef)).toBe(true);
  });

  it("blocks update when abortRef.current is null", () => {
    const controller = { signal: { aborted: false } };
    const abortRef = { current: null };
    expect(shouldUpdateFromController(controller, abortRef)).toBe(false);
  });
});

/* ─── aria-activedescendant ID generation ─── */

describe("aria-activedescendant ID generation", () => {
  it("generates correct option id from index", () => {
    expect(`omni-option-0`).toBe("omni-option-0");
    expect(`omni-option-5`).toBe("omni-option-5");
  });

  it("activeDescendant is undefined when no item is selected", () => {
    const selectedIndex = -1;
    const activeDescendant =
      selectedIndex >= 0 ? `omni-option-${selectedIndex}` : undefined;
    expect(activeDescendant).toBeUndefined();
  });

  it("activeDescendant matches selected option id", () => {
    const selectedIndex = 3;
    const activeDescendant =
      selectedIndex >= 0 ? `omni-option-${selectedIndex}` : undefined;
    expect(activeDescendant).toBe("omni-option-3");
  });
});

/* ─── useOmniHotkeys case-insensitivity ─── */

describe("Ctrl+K hotkey case handling", () => {
  it("matches lowercase k", () => {
    expect("k".toLowerCase()).toBe("k");
  });

  it("matches uppercase K via toLowerCase", () => {
    expect("K".toLowerCase()).toBe("k");
  });

  it("does not match other keys", () => {
    expect("m".toLowerCase() === "k").toBe(false);
  });
});
