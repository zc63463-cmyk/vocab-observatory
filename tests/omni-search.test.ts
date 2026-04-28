import { describe, it, expect } from "vitest";
import { scoreOmniItem, omniActions } from "../components/omni/omni-actions";
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
