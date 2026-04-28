import { slugifyLabel } from "@/lib/utils";

export type VocabGraphNodeType =
  | "current"
  | "root"
  | "synonym"
  | "antonym";

export type VocabGraphRelation =
  | "root-family"
  | "synonym"
  | "antonym";

export type VocabGraphNode = {
  id: string;
  label: string;
  type: VocabGraphNodeType;
  href?: string;
  weight?: number;
  wordId?: string;
};

export type VocabGraphEdge = {
  id: string;
  source: string;
  target: string;
  relation: VocabGraphRelation;
  label?: string;
  weight?: number;
};

export type VocabGraphData = {
  centerId: string;
  nodes: VocabGraphNode[];
  edges: VocabGraphEdge[];
};

export type VocabGraphEntry = {
  id?: string | null;
  slug?: string | null;
  title?: string | null;
  lemma?: string | null;
  metadata?: unknown;
  body_md?: string | null;
  bodyMd?: string | null;
  synonym_items?: unknown;
  resolved_synonym_items?: unknown;
  antonym_items?: unknown;
  resolved_antonym_items?: unknown;
};

type RelationCandidate = {
  label: string;
  relation: VocabGraphRelation;
  type: VocabGraphNodeType;
  weight?: number;
};

const NODE_TYPE_WEIGHT: Record<VocabGraphNodeType, number> = {
  antonym: 4,
  current: 9,
  root: 6,
  synonym: 4,
};

const NODE_TYPE_PRIORITY: Record<VocabGraphNodeType, number> = {
  antonym: 50,
  current: 100,
  root: 70,
  synonym: 50,
};

const ROOT_FIELD_KEYS = [
  "roots",
  "root",
  "rootFamily",
  "root_family",
  "root-family",
  "wordRoots",
  "word_roots",
];

const SYNONYM_FIELD_KEYS = [
  "synonyms",
  "synonymItems",
  "synonym_items",
  "synonymWords",
  "synonym_words",
];

const ANTONYM_FIELD_KEYS = [
  "antonyms",
  "antonymItems",
  "antonym_items",
  "antonymWords",
  "antonym_words",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstText(...values: Array<string | null | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim();
}

function getEntryLabel(entry: VocabGraphEntry) {
  return firstText(entry.title, entry.lemma, entry.slug, entry.id) ?? "untitled";
}

function getEntryId(entry: VocabGraphEntry) {
  const slug = firstText(entry.slug);
  if (slug) {
    return slug;
  }

  const id = firstText(entry.id);
  if (id) {
    return id;
  }

  const derived = slugifyLabel(getEntryLabel(entry));
  return derived || getEntryLabel(entry);
}

function getEntryHref(entry: VocabGraphEntry) {
  const slug = firstText(entry.slug);
  return slug ? `/words/${slug}` : undefined;
}

function normalizeLabel(value: string) {
  const trimmed = value.trim();
  const aliasedWikiLink = /^\[\[([^|\]]+)\|([^\]]+)\]\]$/.exec(trimmed);
  if (aliasedWikiLink) {
    return aliasedWikiLink[1].split("#")[0]?.trim() ?? "";
  }

  const wikiLink = /^\[\[([^\]]+)\]\]$/.exec(trimmed);
  if (wikiLink) {
    return wikiLink[1].split("#")[0]?.trim() ?? "";
  }

  return trimmed;
}

function readMetadataField(metadata: unknown, keys: string[]) {
  if (!isRecord(metadata)) {
    return undefined;
  }

  for (const key of keys) {
    if (key in metadata) {
      return metadata[key];
    }
  }

  return undefined;
}

function normalizeLabelList(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/[,;，、\n]/)
      .map(normalizeLabel)
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeLabelList(item));
  }

  if (isRecord(value)) {
    const nested = firstText(
      typeof value.word === "string" ? value.word : null,
      typeof value.slug === "string" ? value.slug : null,
      typeof value.label === "string" ? value.label : null,
      typeof value.title === "string" ? value.title : null,
      typeof value.lemma === "string" ? value.lemma : null,
      typeof value.name === "string" ? value.name : null,
      typeof value.id === "string" ? value.id : null,
    );

    return nested ? [normalizeLabel(nested)].filter(Boolean) : [];
  }

  return [];
}

function uniqueLabels(labels: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const label of labels) {
    const normalized = normalizeLabel(label);
    const key = slugifyLabel(normalized) || normalized.toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(normalized);
  }

  return unique;
}

function getMetadataLabels(entry: VocabGraphEntry, keys: string[]) {
  return normalizeLabelList(readMetadataField(entry.metadata, keys));
}

function getSynonymLabels(entry: VocabGraphEntry) {
  return uniqueLabels([
    ...normalizeLabelList(entry.resolved_synonym_items),
    ...normalizeLabelList(entry.synonym_items),
    ...getMetadataLabels(entry, SYNONYM_FIELD_KEYS),
  ]);
}

function getAntonymLabels(entry: VocabGraphEntry) {
  return uniqueLabels([
    ...normalizeLabelList(entry.resolved_antonym_items),
    ...normalizeLabelList(entry.antonym_items),
    ...getMetadataLabels(entry, ANTONYM_FIELD_KEYS),
  ]);
}

function getRootLabels(entry: VocabGraphEntry) {
  return uniqueLabels(getMetadataLabels(entry, ROOT_FIELD_KEYS));
}

function lookupKeysForLabel(label: string) {
  const normalized = normalizeLabel(label);
  const slug = slugifyLabel(normalized);
  return [slug, normalized.toLowerCase()].filter(Boolean);
}

function createEntryLookup(allEntries: VocabGraphEntry[]) {
  const lookup = new Map<string, VocabGraphEntry>();

  for (const entry of allEntries) {
    const values = [entry.slug, entry.lemma, entry.title, entry.id]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

    for (const value of values) {
      for (const key of lookupKeysForLabel(value)) {
        if (!lookup.has(key)) {
          lookup.set(key, entry);
        }
      }
    }
  }

  return lookup;
}

function findEntryByLabel(
  label: string,
  lookup: Map<string, VocabGraphEntry>,
) {
  for (const key of lookupKeysForLabel(label)) {
    const entry = lookup.get(key);
    if (entry) {
      return entry;
    }
  }

  return null;
}

function hasSharedLabel(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) {
    return false;
  }

  const rightKeys = new Set(right.map((label) => slugifyLabel(label) || label.toLowerCase()));
  return left.some((label) => rightKeys.has(slugifyLabel(label) || label.toLowerCase()));
}

function makeEdgeId(source: string, target: string, relation: VocabGraphRelation) {
  return `${source}__${relation}__${target}`;
}

function createCandidate(
  labels: string[],
  relation: VocabGraphRelation,
  type: VocabGraphNodeType,
): RelationCandidate[] {
  return uniqueLabels(labels).map((label) => ({
    label,
    relation,
    type,
    weight: NODE_TYPE_WEIGHT[type],
  }));
}

function createNodeFromCandidate(
  candidate: RelationCandidate,
  targetEntry: VocabGraphEntry | null,
): VocabGraphNode {
  const fallbackId = slugifyLabel(candidate.label) || candidate.label;

  return {
    href: targetEntry ? getEntryHref(targetEntry) : undefined,
    id: targetEntry ? getEntryId(targetEntry) : fallbackId,
    label: targetEntry ? getEntryLabel(targetEntry) : candidate.label,
    type: candidate.type,
    weight: candidate.weight,
    ...(targetEntry && firstText(targetEntry.id)
      ? { wordId: firstText(targetEntry.id) }
      : {}),
  };
}

function addOrUpdateNode(nodes: Map<string, VocabGraphNode>, node: VocabGraphNode) {
  const existing = nodes.get(node.id);
  if (!existing) {
    nodes.set(node.id, node);
    return;
  }

  if (NODE_TYPE_PRIORITY[node.type] > NODE_TYPE_PRIORITY[existing.type]) {
    nodes.set(node.id, {
      ...existing,
      href: existing.href ?? node.href,
      label: existing.label || node.label,
      type: node.type,
      weight: Math.max(existing.weight ?? 1, node.weight ?? 1),
    });
    return;
  }

  if (!existing.href && node.href) {
    nodes.set(node.id, { ...existing, href: node.href });
  }
}

export function buildLocalVocabGraph(
  entry: VocabGraphEntry,
  allEntries: VocabGraphEntry[],
): VocabGraphData {
  const centerId = getEntryId(entry);
  const centerNode: VocabGraphNode = {
    href: getEntryHref(entry),
    id: centerId,
    label: getEntryLabel(entry),
    type: "current",
    weight: NODE_TYPE_WEIGHT.current,
    ...(firstText(entry.id) ? { wordId: firstText(entry.id) } : {}),
  };
  const nodes = new Map<string, VocabGraphNode>([[centerId, centerNode]]);
  const edges = new Map<string, VocabGraphEdge>();
  const lookup = createEntryLookup(allEntries);
  const currentRootLabels = getRootLabels(entry);

  const candidates: RelationCandidate[] = [
    ...createCandidate(currentRootLabels, "root-family", "root"),
    ...createCandidate(getSynonymLabels(entry), "synonym", "synonym"),
    ...createCandidate(getAntonymLabels(entry), "antonym", "antonym"),
  ];

  for (const relatedEntry of allEntries) {
    const relatedId = getEntryId(relatedEntry);
    if (relatedId === centerId) {
      continue;
    }

    if (hasSharedLabel(currentRootLabels, getRootLabels(relatedEntry))) {
      candidates.push({
        label: getEntryLabel(relatedEntry),
        relation: "root-family",
        type: "root",
        weight: NODE_TYPE_WEIGHT.root,
      });
    }

  }

  for (const candidate of candidates) {
    const targetEntry = findEntryByLabel(candidate.label, lookup);
    const targetNode = createNodeFromCandidate(candidate, targetEntry);

    if (!targetNode.id || targetNode.id === centerId) {
      continue;
    }

    addOrUpdateNode(nodes, targetNode);

    const edgeId = makeEdgeId(centerId, targetNode.id, candidate.relation);
    if (!edges.has(edgeId)) {
      edges.set(edgeId, {
        id: edgeId,
        label: candidate.label,
        relation: candidate.relation,
        source: centerId,
        target: targetNode.id,
        weight: candidate.weight,
      });
    }
  }

  return {
    centerId,
    edges: [...edges.values()],
    nodes: [...nodes.values()],
  };
}
