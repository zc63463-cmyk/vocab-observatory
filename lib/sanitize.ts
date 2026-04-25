import createDOMPurify from "dompurify";

/**
 * Sanitize HTML content to prevent XSS attacks.
 * Used before rendering any user-generated or markdown-converted HTML via dangerouslySetInnerHTML.
 */

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    "a", "abbr", "b", "blockquote", "br", "code", "del", "em", "h1", "h2", "h3",
    "h4", "h5", "h6", "hr", "i", "img", "li", "mark", "ol", "p", "pre", "s",
    "strong", "sub", "sup", "table", "tbody", "td", "th", "thead", "tr", "ul",
  ],
  ALLOWED_ATTR: [
    "href", "target", "rel", "src", "alt", "title", "class", "id",
    "colspan", "rowspan", "align", "valign",
  ],
  ALLOW_DATA_ATTR: false,
};

let clientPurify: ReturnType<typeof createDOMPurify> | null = null;

/**
 * Synchronous sanitize — client-side only.
 * Use this in React components that render on the client.
 */
export function sanitizeHtmlSync(dirty: string): string {
  if (!dirty) return "";
  if (typeof window === "undefined") {
    // Server-side fallback: basic tag stripping for safety
    return dirty
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/on\w+\s*=\s*"[^"]*"/gi, "")
      .replace(/on\w+\s*=\s*'[^']*'/gi, "");
  }

  if (!clientPurify) {
    clientPurify = createDOMPurify(window);
  }
  return clientPurify.sanitize(dirty, PURIFY_CONFIG);
}
