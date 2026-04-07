/**
 * YAML frontmatter preservation.
 *
 * Frontmatter (the `---` delimited YAML block at the top of a markdown file)
 * is not supported by remark-parse without an extra plugin. Rather than adding
 * a dependency, we strip it before the conversion pipeline and restore it
 * afterwards — the WYSIWYG editor doesn't need to display or edit it.
 */

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/**
 * Strip YAML frontmatter from the beginning of a markdown string.
 * Returns the remaining content and the raw frontmatter block (including
 * the `---` fences) so it can be prepended back later.
 */
export function extractFrontmatter(md: string): {
  content: string;
  frontmatter: string;
} {
  const match = md.match(FRONTMATTER_REGEX);
  if (!match) {
    return { content: md, frontmatter: "" };
  }
  const frontmatter = match[0];
  const content = md.slice(frontmatter.length);
  return { content, frontmatter };
}

/**
 * Prepend previously extracted frontmatter back onto the markdown output.
 * Ensures a blank line separates the closing `---` from the body content.
 */
export function prependFrontmatter(md: string, frontmatter: string): string {
  if (!frontmatter) return md;
  // remark trims leading whitespace, so the blank line between the
  // frontmatter and body may be lost. Re-insert it if needed.
  if (md.length > 0 && !md.startsWith("\n")) {
    return frontmatter + "\n" + md;
  }
  return frontmatter + md;
}
