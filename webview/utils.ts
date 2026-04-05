/** Scroll an element (by id) into view, accounting for sticky headings. */
export function scrollToBlock(id: string) {
  const el =
    document.getElementById(id) || document.querySelector(`[data-id="${id}"]`);
  const container = document.querySelector(".editor-container");
  if (!el || !container) return;

  const stickyEl = container.querySelector(".sticky-headings");
  const stickyHeight = stickyEl ? stickyEl.getBoundingClientRect().height : 0;
  const elTop = el.getBoundingClientRect().top;
  const containerTop = container.getBoundingClientRect().top;
  const offset = elTop - containerTop + container.scrollTop - stickyHeight;

  container.scrollTo({ top: offset, behavior: "smooth" });
}
