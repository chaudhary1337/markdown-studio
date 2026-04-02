/** Get the heading level (1-6) from a BlockNote heading element. */
export function getHeadingLevel(el: Element): number {
  const inner = el.querySelector("h1, h2, h3, h4, h5, h6");
  return inner ? parseInt(inner.tagName[1], 10) : 1;
}

/** Scroll a block (by data-id) into view, accounting for sticky headings. */
export function scrollToBlock(id: string) {
  const el = document.querySelector(`[data-id="${id}"]`);
  const container = document.querySelector(".editor-container");
  if (!el || !container) return;

  const stickyEl = container.querySelector(".sticky-headings");
  const stickyHeight = stickyEl ? stickyEl.getBoundingClientRect().height : 0;
  const elTop = el.getBoundingClientRect().top;
  const containerTop = container.getBoundingClientRect().top;
  const offset = elTop - containerTop + container.scrollTop - stickyHeight;

  container.scrollTo({ top: offset, behavior: "smooth" });
}
