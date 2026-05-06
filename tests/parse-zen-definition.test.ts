import { describe, expect, it } from "vitest";
import { parseZenDefinition } from "@/lib/review/parse-zen-definition";

describe("parseZenDefinition", () => {
  it("splits a bare paragraph and wraps grammar patterns as code", () => {
    const blocks = parseZenDefinition(
      "v. ①推迟，延误 V N; V V-ing ; n. ①推迟，延误 N; a ~ of N ;",
    );
    expect(blocks).toHaveLength(1);
    const [paragraph] = blocks;
    expect(paragraph.kind).toBe("paragraph");
    if (paragraph.kind !== "paragraph") return;

    const codeTokens = paragraph.segments
      .filter((segment) => segment.kind === "code")
      .map((segment) => segment.content);
    expect(codeTokens).toEqual(["V N", "V V-ing", "a ~ of N"]);
  });

  it("preserves authored inline code, bold, and highlight", () => {
    const blocks = parseZenDefinition(
      "**v.** ①==**退位**== `V the throne` `[政治]`；",
    );
    const [paragraph] = blocks;
    expect(paragraph.kind).toBe("paragraph");
    if (paragraph.kind !== "paragraph") return;

    const kinds = paragraph.segments.map((s) => s.kind);
    expect(kinds).toContain("bold");
    expect(kinds).toContain("highlight");
    expect(kinds).toContain("code");

    const codeTokens = paragraph.segments
      .filter((segment) => segment.kind === "code")
      .map((segment) => segment.content);
    expect(codeTokens).toContain("V the throne");
    expect(codeTokens).toContain("[政治]");
  });

  it("parses a tip callout with **label**：value rows", () => {
    const md = [
      "> [!tip] 原型义",
      "> **原型义**：离开权力（从王座上走下来）",
      "> **延伸维度**：社会路径",
      "> **隐喻类型**：方位隐喻（空间下降→社会地位降低）",
    ].join("\n");

    const blocks = parseZenDefinition(md);
    expect(blocks).toHaveLength(1);
    const [callout] = blocks;
    expect(callout.kind).toBe("callout");
    if (callout.kind !== "callout") return;

    expect(callout.type).toBe("tip");
    expect(callout.title).toBe("原型义");
    expect(callout.rows).toHaveLength(3);
    expect(callout.rows.map((row) => row.label)).toEqual([
      "原型义",
      "延伸维度",
      "隐喻类型",
    ]);
  });

  it("handles the full delay-style block (paragraph + callout)", () => {
    const md = [
      "v. ①推迟，延误 V N; V V-ing ; n. ①推迟，延误 N; a ~ of N ;",
      "",
      "> [!tip] 原型义",
      "> **原型义**：推迟、使时间延后",
      "> **延伸维度**：时间路径",
      "> **隐喻类型**：无隐喻",
    ].join("\n");

    const blocks = parseZenDefinition(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].kind).toBe("paragraph");
    expect(blocks[1].kind).toBe("callout");
  });

  it("does not misclassify single-token grammar noise", () => {
    const blocks = parseZenDefinition("n. 能力，本领 N");
    const [paragraph] = blocks;
    if (paragraph.kind !== "paragraph") throw new Error("expected paragraph");

    // Single stray "N" should stay as plain text, not become a code chip
    // — too high a false-positive rate otherwise (e.g. Chinese prose).
    const hasStrayCode = paragraph.segments.some(
      (segment) => segment.kind === "code" && segment.content === "N",
    );
    expect(hasStrayCode).toBe(false);
  });

  it("collapses single newlines inside a paragraph (flashcard-friendly)", () => {
    const blocks = parseZenDefinition("line one\nline two");
    const [paragraph] = blocks;
    if (paragraph.kind !== "paragraph") throw new Error("expected paragraph");

    const text = paragraph.segments
      .filter((segment) => segment.kind === "text")
      .map((segment) => segment.content)
      .join("");
    expect(text).toContain("line one line two");
  });

  it("returns an empty list for empty input", () => {
    expect(parseZenDefinition("")).toEqual([]);
    expect(parseZenDefinition("   \n\n  ")).toEqual([]);
  });
});
