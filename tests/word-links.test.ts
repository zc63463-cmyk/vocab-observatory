import { describe, expect, it } from "vitest";
import {
  resolveAntonymItems,
  resolveSynonymItems,
  resolveWordHref,
} from "@/lib/words";

describe("word link helpers", () => {
  const availableSlugs = new Set(["ability", "inability", "capacity"]);

  it("returns a word href when the slug exists", () => {
    expect(resolveWordHref("ability", availableSlugs)).toBe("/words/ability");
  });

  it("returns null when the target slug does not exist", () => {
    expect(resolveWordHref("capable", availableSlugs)).toBeNull();
  });

  it("resolves synonym items without dropping their structured fields", () => {
    expect(
      resolveSynonymItems(
        [
          {
            delta: "程度更强",
            object: "任务",
            semanticDiff: "更强调完成复杂任务的能力",
            tone: "中性",
            usage: "偏正式",
            word: "capacity",
          },
          {
            delta: "程度更弱",
            object: "行为",
            semanticDiff: "泛指有能力去做",
            tone: "中性",
            usage: "通用",
            word: "capable",
          },
        ],
        availableSlugs,
      ),
    ).toEqual([
      {
        delta: "程度更强",
        href: "/words/capacity",
        object: "任务",
        semanticDiff: "更强调完成复杂任务的能力",
        tone: "中性",
        usage: "偏正式",
        word: "capacity",
      },
      {
        delta: "程度更弱",
        href: null,
        object: "行为",
        semanticDiff: "泛指有能力去做",
        tone: "中性",
        usage: "通用",
        word: "capable",
      },
    ]);
  });

  it("resolves antonym items without dropping their notes", () => {
    expect(
      resolveAntonymItems(
        [
          {
            note: "能力的精确反义",
            word: "inability",
          },
          {
            note: "非稳定目标，不应生成死链接",
            word: "weakness",
          },
        ],
        availableSlugs,
      ),
    ).toEqual([
      {
        href: "/words/inability",
        note: "能力的精确反义",
        word: "inability",
      },
      {
        href: null,
        note: "非稳定目标，不应生成死链接",
        word: "weakness",
      },
    ]);
  });
});
