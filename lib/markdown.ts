import { marked } from "marked";
import { slugifyLabel } from "@/lib/utils";

marked.setOptions({
  gfm: true,
  breaks: true,
});

function replaceWikiLinks(input: string) {
  return input
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, (_, slug, label) => {
      return `[${label}](/words/${slugifyLabel(slug)})`;
    })
    .replace(/\[\[([^\]]+)\]\]/g, (_, slug) => {
      return `[${slug}](/words/${slugifyLabel(slug)})`;
    });
}

function replaceCallouts(input: string) {
  return input
    .replace(/^> \[![^\]]+\]\s*(.+)$/gm, "### $1")
    .replace(/^>\s?/gm, "");
}

function replaceHighlights(input: string) {
  return input.replace(/==([^=]+)==/g, "<mark>$1</mark>");
}

export function normalizeObsidianMarkdown(input: string) {
  return replaceHighlights(replaceWikiLinks(replaceCallouts(input)));
}

/**
 * Render Obsidian markdown to raw HTML (no sanitization).
 * For server-side usage, the caller should pass the result through `sanitizeHtml()`
 * from `@/lib/sanitize-server` before storing or serving it.
 * For client-side usage, use `sanitizeHtmlSync()` from `@/lib/sanitize`.
 */
export async function renderObsidianMarkdown(input: string): Promise<string> {
  const normalized = normalizeObsidianMarkdown(input);
  return marked.parse(normalized) as string;
}

export function getSection(markdown: string, heading: string) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingPattern = new RegExp(`^##\\s+${escapedHeading}\\s*$`, "m");
  const headingMatch = headingPattern.exec(markdown);
  if (!headingMatch) {
    return "";
  }

  const remainder = markdown
    .slice(headingMatch.index + headingMatch[0].length)
    .replace(/^\n+/, "");
  const nextHeadingMatch = /^##\s+/m.exec(remainder);

  return nextHeadingMatch
    ? remainder.slice(0, nextHeadingMatch.index).trim()
    : remainder.trim();
}
