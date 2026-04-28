import { describe, expect, it } from "vitest";
import {
  buildLocalVocabGraph,
  extractWikiLinks,
  type VocabGraphEntry,
} from "@/lib/vocab-graph";

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
        "related",
      ]),
    );
    expect(graph.edges.map((edge) => edge.relation)).not.toEqual(
      expect.arrayContaining(["semantic-field", "backlink"]),
    );
    // antifragile is linked via body_md wikilink [[antifragile]]
    expect(graph.nodes.some((node) => node.id === "antifragile")).toBe(true);
    expect(graph.edges.some((edge) => edge.target === "antifragile" && edge.relation === "related")).toBe(true);
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

  it("arbitrates same target from synonym and wikilink into one synonym edge", () => {
    const graph = buildLocalVocabGraph(
      {
        body_md: "see also [[robust]]",
        lemma: "resilient",
        metadata: {
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

  it("parses wikilink alias [[slug|display text]] into slug", () => {
    const graph = buildLocalVocabGraph(
      {
        body_md: "[[robust|strong and durable]]",
        lemma: "resilient",
        metadata: {},
        slug: "resilient",
        title: "resilient",
      },
      allEntries,
    );

    expect(graph.nodes.some((node) => node.id === "robust")).toBe(true);
    expect(graph.edges.some((edge) => edge.target === "robust" && edge.relation === "related")).toBe(true);
  });

  it("parses wikilink anchor [[slug#heading]] into slug", () => {
    const graph = buildLocalVocabGraph(
      {
        body_md: "[[robust#usage]]",
        lemma: "resilient",
        metadata: {},
        slug: "resilient",
        title: "resilient",
      },
      allEntries,
    );

    expect(graph.nodes.some((node) => node.id === "robust")).toBe(true);
    expect(graph.edges.some((edge) => edge.target === "robust" && edge.relation === "related")).toBe(true);
  });

  it("parses alias + anchor [[slug#heading|display]] into slug", () => {
    const graph = buildLocalVocabGraph(
      {
        body_md: "[[robust#usage|usage note]]",
        lemma: "resilient",
        metadata: {},
        slug: "resilient",
        title: "resilient",
      },
      allEntries,
    );

    expect(graph.nodes.some((node) => node.id === "robust")).toBe(true);
    expect(graph.edges.some((edge) => edge.target === "robust" && edge.relation === "related")).toBe(true);
  });

  it("skips self-reference wikilink [[current-slug]]", () => {
    const graph = buildLocalVocabGraph(
      {
        body_md: "[[resilient]]",
        lemma: "resilient",
        metadata: {},
        slug: "resilient",
        title: "resilient",
      },
      allEntries,
    );

    expect(graph.edges.some((edge) => edge.target === "resilient")).toBe(false);
    expect(graph.nodes.length).toBe(1);
  });

  it("creates orphan node for nonexistent wikilink target", () => {
    const graph = buildLocalVocabGraph(
      {
        body_md: "[[nonexistent]]",
        lemma: "resilient",
        metadata: {},
        slug: "resilient",
        title: "resilient",
      },
      allEntries,
    );

    expect(graph.nodes.some((node) => node.id === "nonexistent" && node.href === undefined)).toBe(true);
    expect(graph.edges.some((edge) => edge.target === "nonexistent" && edge.relation === "related")).toBe(true);
  });

  it("falls back to bodyMd when body_md is empty", () => {
    const graph = buildLocalVocabGraph(
      {
        bodyMd: "[[robust]]",
        lemma: "resilient",
        metadata: {},
        slug: "resilient",
        title: "resilient",
      },
      allEntries,
    );

    expect(graph.nodes.some((node) => node.id === "robust")).toBe(true);
    expect(graph.edges.some((edge) => edge.target === "robust" && edge.relation === "related")).toBe(true);
  });
});

describe("extractWikiLinks", () => {
  it("extracts plain wikilink [[slug]]", () => {
    const result = extractWikiLinks("See [[robust]] for more", "center");
    expect(result).toEqual(["robust"]);
  });

  it("extracts wikilink with alias [[slug|display]]", () => {
    const result = extractWikiLinks("See [[robust|strong]] for more", "center");
    expect(result).toEqual(["robust"]);
  });

  it("extracts wikilink with anchor [[slug#heading]]", () => {
    const result = extractWikiLinks("See [[robust#usage]] for more", "center");
    expect(result).toEqual(["robust"]);
  });

  it("extracts wikilink with alias and anchor [[slug#heading|display]]", () => {
    const result = extractWikiLinks("See [[robust#usage|note]] for more", "center");
    expect(result).toEqual(["robust"]);
  });

  it("skips pure heading reference [[#heading]]", () => {
    const result = extractWikiLinks("See [[#section]] for more", "center");
    expect(result).toEqual([]);
  });

  it("skips self-reference to center", () => {
    const result = extractWikiLinks("See [[center]] for more", "center");
    expect(result).toEqual([]);
  });

  it("deduplicates repeated links", () => {
    const result = extractWikiLinks("[[robust]] and [[robust]] again", "center");
    expect(result).toEqual(["robust"]);
  });

  it("returns empty array for null/undefined", () => {
    expect(extractWikiLinks(null, "center")).toEqual([]);
    expect(extractWikiLinks(undefined, "center")).toEqual([]);
    expect(extractWikiLinks("", "center")).toEqual([]);
  });
});
