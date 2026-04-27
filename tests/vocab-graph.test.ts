import { describe, expect, it } from "vitest";
import { buildLocalVocabGraph, type VocabGraphEntry } from "@/lib/vocab-graph";

const allEntries: VocabGraphEntry[] = [
  {
    id: "word-resilient",
    lemma: "resilient",
    metadata: {
      roots: ["resil"],
    },
    slug: "resilient",
    title: "resilient",
  },
  {
    id: "word-robust",
    lemma: "robust",
    metadata: {},
    slug: "robust",
    title: "robust",
  },
  {
    id: "word-fragile",
    lemma: "fragile",
    metadata: {},
    slug: "fragile",
    title: "fragile",
  },
  {
    id: "word-antifragile",
    lemma: "antifragile",
    metadata: {},
    slug: "antifragile",
    title: "antifragile",
  },
  {
    id: "word-rebound",
    lemma: "rebound",
    metadata: {
      roots: ["resil"],
    },
    slug: "rebound",
    title: "rebound",
  },
];

describe("buildLocalVocabGraph", () => {
  it("generates a center node and multiple relation edges", () => {
    const graph = buildLocalVocabGraph(
      {
        body_md: "See also [[antifragile]].",
        lemma: "resilient",
        metadata: {
          related: ["antifragile"],
          roots: ["resil"],
          semanticFields: ["recovery"],
          synonyms: ["robust"],
        },
        resolved_antonym_items: [{ href: "/words/fragile", word: "fragile" }],
        slug: "resilient",
        title: "resilient",
      },
      allEntries,
    );

    expect(graph.centerId).toBe("resilient");
    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "resilient", type: "current" }),
        expect.objectContaining({ id: "robust", href: "/words/robust" }),
        expect.objectContaining({ id: "fragile", href: "/words/fragile" }),
        expect.objectContaining({ id: "rebound", href: "/words/rebound" }),
      ]),
    );
    expect(graph.edges.map((edge) => edge.relation)).toEqual(
      expect.arrayContaining([
        "root-family",
        "synonym",
        "antonym",
      ]),
    );
    expect(graph.edges.map((edge) => edge.relation)).not.toEqual(
      expect.arrayContaining(["semantic-field", "backlink", "related"]),
    );
    expect(graph.nodes.some((node) => node.id === "antifragile")).toBe(false);
  });

  it("deduplicates repeated relation labels into one node", () => {
    const graph = buildLocalVocabGraph(
      {
        lemma: "resilient",
        metadata: {
          related: ["robust", "Robust", "[[robust]]"],
          synonyms: ["robust"],
        },
        slug: "resilient",
        title: "resilient",
      },
      allEntries,
    );

    expect(graph.nodes.filter((node) => node.id === "robust")).toHaveLength(1);
    expect(graph.edges.filter((edge) => edge.target === "robust")).toHaveLength(1);
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        relation: "synonym",
        source: "resilient",
        target: "robust",
      }),
    );
  });

  it("keeps missing synonym entries as orphan nodes without hrefs", () => {
    const graph = buildLocalVocabGraph(
      {
        lemma: "resilient",
        metadata: {
          synonyms: ["tenacious"],
        },
        slug: "resilient",
        title: "resilient",
      },
      allEntries,
    );

    expect(graph.nodes).toContainEqual(
      expect.objectContaining({
        href: undefined,
        id: "tenacious",
        label: "tenacious",
        type: "synonym",
      }),
    );
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        relation: "synonym",
        source: "resilient",
        target: "tenacious",
      }),
    );
  });

  it("returns only the center node when metadata is empty", () => {
    const graph = buildLocalVocabGraph(
      {
        lemma: "solitary",
        metadata: {},
        slug: "solitary",
        title: "solitary",
      },
      allEntries,
    );

    expect(graph).toEqual({
      centerId: "solitary",
      edges: [],
      nodes: [
        {
          href: "/words/solitary",
          id: "solitary",
          label: "solitary",
          type: "current",
          weight: 9,
        },
      ],
    });
  });
});
