"use client";

import type { Route } from "next";
import Link from "next/link";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

interface RelationGroup {
  label: string;
  color: string;
  items: { text: string; href?: string }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/[,;，、\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === "string") return item.trim();
      if (isRecord(item)) {
        const text =
          (typeof item.word === "string" ? item.word : null) ??
          (typeof item.lemma === "string" ? item.lemma : null) ??
          (typeof item.label === "string" ? item.label : null) ??
          (typeof item.title === "string" ? item.title : null) ??
          null;
        return text ? [text.trim()] : [];
      }
      return [];
    });
  }
  return [];
}

function readMetadataField(metadata: unknown, keys: string[]): unknown {
  if (!isRecord(metadata)) return undefined;
  for (const key of keys) {
    if (key in metadata) return metadata[key];
  }
  return undefined;
}

function buildGroups(metadata: unknown): RelationGroup[] {
  const groups: RelationGroup[] = [];

  // Synonyms
  const synonymRaw = readMetadataField(metadata, [
    "synonyms",
    "synonymItems",
    "synonym_items",
    "synonymWords",
    "synonym_words",
  ]);
  const synonyms = extractStrings(synonymRaw);
  if (synonyms.length > 0) {
    groups.push({
      label: "近义",
      color: "#3b82f6", // blue-500
      items: synonyms.map((s) => ({ text: s })),
    });
  }

  // Antonyms
  const antonymRaw = readMetadataField(metadata, [
    "antonyms",
    "antonymItems",
    "antonym_items",
    "antonymWords",
    "antonym_words",
  ]);
  const antonyms = extractStrings(antonymRaw);
  if (antonyms.length > 0) {
    groups.push({
      label: "反义",
      color: "#f59e0b", // amber-500
      items: antonyms.map((s) => ({ text: s })),
    });
  }

  // Roots
  const rootRaw = readMetadataField(metadata, [
    "roots",
    "root",
    "rootFamily",
    "root_family",
    "root-family",
    "wordRoots",
    "word_roots",
  ]);
  const roots = extractStrings(rootRaw);
  if (roots.length > 0) {
    groups.push({
      label: "词根",
      color: "#8b5cf6", // violet-500
      items: roots.map((s) => ({ text: s })),
    });
  }

  return groups;
}

interface WordRelationLinksProps {
  metadata: unknown;
}

export function WordRelationLinks({ metadata }: WordRelationLinksProps) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => buildGroups(metadata), [metadata]);

  if (groups.length === 0) return null;

  const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="mt-4 border-t border-[var(--color-border)] pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
          词汇关联 ({totalItems} 条)
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }}>
          <ChevronDown className="h-4 w-4 text-[var(--color-ink-soft)]" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0, marginTop: 0 }}
            animate={{ height: "auto", opacity: 1, marginTop: 12 }}
            exit={{ height: 0, opacity: 0, marginTop: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-3">
              {groups.map((group) => (
                <div key={group.label}>
                  <span
                    className="mb-1.5 inline-block text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: group.color }}
                  >
                    {group.label}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map((item, i) =>
                      item.href ? (
                        <Link
                          key={`${group.label}-${i}`}
                          href={item.href as Route}
                          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-0.5 text-xs text-[var(--color-ink)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                        >
                          {item.text}
                        </Link>
                      ) : (
                        <span
                          key={`${group.label}-${i}`}
                          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-0.5 text-xs text-[var(--color-ink-soft)]"
                        >
                          {item.text}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
