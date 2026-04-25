import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

/**
 * Server-only HTML sanitizer.
 * This file MUST only be imported from server-side code paths
 * to avoid bundling jsdom into the client.
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

let serverPurify: ReturnType<typeof createDOMPurify> | null = null;

function getServerPurify(): ReturnType<typeof createDOMPurify> {
  if (serverPurify) return serverPurify;
  const dom = new JSDOM("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsdom window is close enough
  serverPurify = createDOMPurify(dom.window as any);
  return serverPurify;
}

/**
 * Sanitize HTML on the server side using jsdom + DOMPurify.
 */
export function sanitizeHtmlServer(dirty: string): string {
  if (!dirty) return "";
  return getServerPurify().sanitize(dirty, PURIFY_CONFIG);
}
