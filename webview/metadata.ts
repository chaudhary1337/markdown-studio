/**
 * Metadata block for preserving information lost during BlockNote round-trips.
 *
 * Stored as an HTML comment at the bottom of the markdown file:
 *   <!-- better-markdown-meta {"h":[{"t":"Heading Text","l":4}]} -->
 *
 * Currently tracks:
 *   - h4-h6 heading levels (BlockNote only supports h1-h3)
 *
 * Keyed by heading text content (not line number) so it survives
 * content edits, reordering, and line changes.
 */

const META_PREFIX = "<!-- better-markdown-meta ";
const META_SUFFIX = " -->";
const META_REGEX = /\n?<!-- better-markdown-meta (.+?) -->\s*$/;

interface HeadingMeta {
  /** Heading text (trimmed) */
  t: string;
  /** Original heading level (4, 5, or 6) */
  l: number;
}

export interface Metadata {
  /** Headings with levels > 3 */
  h: HeadingMeta[];
}

/**
 * Extract metadata from the end of a markdown string.
 * Returns the markdown without the meta block, and the parsed metadata.
 */
export function extractMeta(md: string): { content: string; meta: Metadata } {
  const match = md.match(META_REGEX);
  if (!match) {
    return { content: md, meta: { h: [] } };
  }
  const content = md.slice(0, match.index!);
  try {
    const meta = JSON.parse(match[1]) as Metadata;
    return { content, meta };
  } catch {
    return { content, meta: { h: [] } };
  }
}

/**
 * Scan raw markdown for h4-h6 headings and build metadata.
 * Called on first load to capture original heading levels.
 */
export function buildMeta(md: string): Metadata {
  const headings: HeadingMeta[] = [];
  const lines = md.split("\n");
  for (const line of lines) {
    const match = line.match(/^(#{4,6})\s+(.+)$/);
    if (match) {
      headings.push({
        t: match[2].trim(),
        l: match[1].length,
      });
    }
  }
  return { h: headings };
}

/**
 * Append metadata as an HTML comment at the end of the markdown.
 * Only appends if there's something to store.
 */
export function appendMeta(md: string, meta: Metadata): string {
  // Strip any existing meta block first
  md = md.replace(META_REGEX, "");
  // Trim trailing whitespace but keep one newline
  md = md.replace(/\s+$/, "\n");
  if (meta.h.length === 0) {
    return md;
  }
  return md + "\n" + META_PREFIX + JSON.stringify(meta) + META_SUFFIX + "\n";
}

/**
 * Restore h4-h6 headings in markdown output using stored metadata.
 * Matches by heading text content (case-sensitive, trimmed).
 * All h3 headings that match a stored h4/h5/h6 get their level restored.
 */
export function restoreHeadings(md: string, meta: Metadata): string {
  if (meta.h.length === 0) return md;

  // Build a lookup: heading text → original level
  const lookup = new Map<string, number>();
  for (const h of meta.h) {
    lookup.set(h.t, h.l);
  }

  const lines = md.split("\n");
  const result: string[] = [];
  for (const line of lines) {
    // Match ### headings (what BlockNote outputs for downgraded h4-h6)
    const match = line.match(/^###\s+(.+)$/);
    if (match) {
      const text = match[1].trim();
      const originalLevel = lookup.get(text);
      if (originalLevel) {
        result.push("#".repeat(originalLevel) + " " + text);
        continue;
      }
    }
    result.push(line);
  }
  return result.join("\n");
}
