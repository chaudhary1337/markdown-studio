import React, { useEffect, useState, useCallback } from "react";
import { scrollToBlock } from "../utils";

interface StickyHeading {
  id: string;
  text: string;
  level: number;
}

function getHeadingLevel(el: Element): number {
  // Tiptap renders headings directly as <h1>-<h6>
  const tag = el.tagName;
  if (/^H[1-6]$/.test(tag)) return parseInt(tag[1], 10);
  const inner = el.querySelector("h1, h2, h3, h4, h5, h6");
  return inner ? parseInt(inner.tagName[1], 10) : 1;
}

export function StickyHeadings() {
  const [stickyStack, setStickyStack] = useState<StickyHeading[]>([]);

  const update = useCallback(() => {
    const container = document.querySelector(".editor-container");
    if (!container) return;

    // Tiptap renders headings as direct <h1>-<h6> elements inside .tiptap-editor
    const headingEls = container.querySelectorAll(
      ".tiptap-editor h1, .tiptap-editor h2, .tiptap-editor h3, .tiptap-editor h4, .tiptap-editor h5, .tiptap-editor h6"
    );
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
          aboveViewport.push({
            id: el.id || `heading-${index}`,
            text,
            level: getHeadingLevel(el),
          });
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
    container.addEventListener("scroll", update, { passive: true });
    const interval = setInterval(update, 1000);
    return () => {
      container.removeEventListener("scroll", update);
      clearInterval(interval);
    };
  }, [update]);

  if (stickyStack.length === 0) return null;

  return (
    <div className="sticky-headings">
      {stickyStack.map((h) => (
        <div
          key={h.id}
          className={`sticky-heading sticky-heading-h${h.level}`}
          onClick={() => {
            const el = document.getElementById(h.id) || document.querySelector(`[id="${h.id}"]`);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          role="button"
          tabIndex={0}
        >
          {h.text}
        </div>
      ))}
    </div>
  );
}
