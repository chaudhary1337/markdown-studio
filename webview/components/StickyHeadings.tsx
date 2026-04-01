import React, { useEffect, useState, useCallback } from "react";
import { BlockNoteEditor } from "@blocknote/core";

interface StickyHeading {
  id: string;
  text: string;
  level: number;
}

function getHeadingLevel(el: Element): number {
  const inner = el.querySelector("h1, h2, h3, h4, h5, h6");
  if (inner) {
    return parseInt(inner.tagName[1], 10);
  }
  return 1;
}

export function StickyHeadings({ editor }: { editor: BlockNoteEditor }) {
  const [stickyStack, setStickyStack] = useState<StickyHeading[]>([]);

  const updateStickyHeadings = useCallback(() => {
    const container = document.querySelector(".editor-container");
    if (!container) return;

    const headingEls = container.querySelectorAll(
      '[data-content-type="heading"]'
    );
    const containerRect = container.getBoundingClientRect();

    const stickyEl = container.querySelector(".sticky-headings");
    const stickyHeight = stickyEl ? stickyEl.getBoundingClientRect().height : 0;
    const threshold = containerRect.top + stickyHeight + 4;

    const aboveViewport: StickyHeading[] = [];

    headingEls.forEach((el, index) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < threshold) {
        const level = getHeadingLevel(el);
        const text = el.textContent || "";
        const blockWrapper = el.closest("[data-id]");
        const id = blockWrapper?.getAttribute("data-id") || `heading-${index}`;
        if (text.trim()) {
          aboveViewport.push({ id, text: text.trim(), level });
        }
      }
    });

    const stack: StickyHeading[] = [];
    for (const h of aboveViewport) {
      while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
        stack.pop();
      }
      stack.push(h);
    }

    setStickyStack(stack);
  }, []);

  useEffect(() => {
    const container = document.querySelector(".editor-container");
    if (!container) return;

    container.addEventListener("scroll", updateStickyHeadings, {
      passive: true,
    });
    const interval = setInterval(updateStickyHeadings, 1000);

    return () => {
      container.removeEventListener("scroll", updateStickyHeadings);
      clearInterval(interval);
    };
  }, [updateStickyHeadings]);

  if (stickyStack.length === 0) return null;

  return (
    <div className="sticky-headings">
      {stickyStack.map((h) => (
        <div
          key={h.id}
          className={`sticky-heading sticky-heading-h${h.level}`}
          onClick={() => scrollToHeading(h.id)}
          role="button"
          tabIndex={0}
        >
          {h.text}
        </div>
      ))}
    </div>
  );
}

function scrollToHeading(id: string) {
  const el = document.querySelector(`[data-id="${id}"]`);
  const container = document.querySelector(".editor-container");
  const stickyEl = document.querySelector(".sticky-headings");
  if (!el || !container) return;

  const stickyHeight = stickyEl ? stickyEl.getBoundingClientRect().height : 0;
  const elTop = el.getBoundingClientRect().top;
  const containerTop = container.getBoundingClientRect().top;
  const offset = elTop - containerTop + container.scrollTop - stickyHeight;

  container.scrollTo({ top: offset, behavior: "smooth" });
}
