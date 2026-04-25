/**
 * Server-only HTML sanitizer — pure JS, zero dependencies.
 * This file MUST only be imported from server-side code paths.
 *
 * Covers the main XSS attack vectors:
 * - <script> tags and their content
 * - event handlers (onclick, onload, onerror, etc.)
 * - javascript: / vbscript: / data: URLs in href/src
 * - <object>, <embed>, <base>, <meta> dangerous tags
 *
 * NOTE: This is a defense-in-depth measure. The primary content source
 * is owner-controlled Obsidian markdown, not arbitrary user input.
 */

/** Tags that are completely removed (including their inner content) */
const DANGEROUS_TAGS = [
  "script", "style", "iframe", "object", "embed",
  "base", "meta", "link", "applet",
];

function stripDangerousTags(html: string): string {
  // Remove dangerous tags and their content
  for (const tag of DANGEROUS_TAGS) {
    // Opening tag + content + closing tag (non-greedy)
    html = html.replace(
      new RegExp(`<${tag}\\b[^>]*>.*?<\\/${tag}>`, "gis"),
      "",
    );
    // Self-closing or unclosed opening tag
    html = html.replace(new RegExp(`<${tag}\\b[^>]*/?>`, "gi"), "");
  }
  return html;
}

function stripDangerousAttrs(html: string): string {
  // Remove all event handler attributes (onclick, onload, onerror, etc.)
  html = html.replace(/\s+\w*on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // Strip javascript:, vbscript:, data: URLs in href/src
  html = html.replace(
    /(href|src|action|xlink:href)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi,
    '$1=""',
  );
  html = html.replace(
    /(href|src|action|xlink:href)\s*=\s*(?:"vbscript:[^"]*"|'vbscript:[^']*')/gi,
    '$1=""',
  );
  // data: URLs in src/href (except for allowed img data: URIs)
  html = html.replace(
    /(href|action|xlink:href)\s*=\s*(?:"data:[^"]*"|'data:[^']*')/gi,
    '$1=""',
  );
  return html;
}

/**
 * Sanitize HTML on the server side — pure JS, no DOM needed.
 */
export function sanitizeHtmlServer(dirty: string): string {
  if (!dirty) return "";

  try {
    let clean = dirty;
    clean = stripDangerousTags(clean);
    clean = stripDangerousAttrs(clean);
    return clean;
  } catch (err) {
    console.error("[sanitize-server] Sanitization failed:", err);
    // Last resort: strip all tags
    return dirty.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<[^>]*>?/gm, "");
  }
}
