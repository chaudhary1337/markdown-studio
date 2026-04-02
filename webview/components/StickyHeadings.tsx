import React, { useEffect, useState, useCallback } from "react";
import { BlockNoteEditor } from "@blocknote/core";
import { getHeadingLevel, scrollToBlock } from "../utils";

interface StickyHeading {
  id: string;
  text: string;
  level: number;
}

export function StickyHeadings({ editor }: { editor: BlockNoteEditor }) {
  const [stickyStack, setStickyStack] = useState<StickyHeading[]>([]);

  const updateStickyHeadings = useCallback(() => {
    const container = document.querySelector(".editor-container");
    if (!container) return;

    const headingEls = container.querySelectorAll('[data-content-type="heading"]');
    const containerRect = container.getBoundingClientRect();
    const stickyEl = container.querySelector(".sticky-headings");
    const stickyHeight = stickyEl ? stickyEl.getBoundingClientRect().height : 0;
    const threshold = containerRect.top + stickyHeight + 4;

    const aboveViewport: StickyHeading[] = [];
    headingEls.forEach((el, index) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < threshold) {
        const text = el.textContent?.trim();
        if (text) {
          const id = el.closest("[data-id]")?.getAttribute("data-id") || `heading-${index}`;
          aboveViewport.push({ id, text, level: getHeadingLevel(el) });
        }
      }
    });

    const stack: StickyHeading[] = [];
    for (const h of aboveViewport) {
      while (stack.length > 0 && stack[stack.length - 1].level >= h.level) stack.pop();
      stack.push(h);
    }
    setStickyStack(stack);
  }, []);

  useEffect(() => {
    const container = document.querySelector(".editor-container");
    if (!container) return;
    container.addEventListener("scroll", updateStickyHeadings, { passive: true });
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
          onClick={() => scrollToBlock(h.id)}
          role="button"
          tabIndex={0}
        >
          {h.text}
        </div>
      ))}
    </div>
  );
}
