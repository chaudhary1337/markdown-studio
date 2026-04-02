import React, { useEffect, useState, useCallback, useRef } from "react";
import { scrollToBlock } from "../utils";

interface StickyHeading {
  id: string;
  text: string;
  level: number;
}

export function StickyHeadings() {
  const [stickyStack, setStickyStack] = useState<StickyHeading[]>([]);
  const prevStackRef = useRef<string>("");

  const update = useCallback(() => {
    const container = document.querySelector(".editor-container");
    if (!container) return;

    const headingEls = container.querySelectorAll(
      ".tiptap-editor h1, .tiptap-editor h2, .tiptap-editor h3, .tiptap-editor h4, .tiptap-editor h5, .tiptap-editor h6"
    );
    const containerRect = container.getBoundingClientRect();
    const stickyEl = container.querySelector(".sticky-headings");
    const stickyHeight = stickyEl ? stickyEl.getBoundingClientRect().height : 0;
    // Hysteresis: heading must be 12px past the threshold to register
    const threshold = containerRect.top + stickyHeight + 12;

    const aboveViewport: StickyHeading[] = [];
    headingEls.forEach((el, index) => {
      const rect = el.getBoundingClientRect();
      if (rect.bottom < threshold) {
        const text = el.textContent?.trim();
        if (text) {
          aboveViewport.push({
            id: el.id || `heading-${index}`,
            text,
            level: parseInt(el.tagName[1], 10),
          });
        }
      }
    });

    const stack: StickyHeading[] = [];
    for (const h of aboveViewport) {
      while (stack.length > 0 && stack[stack.length - 1].level >= h.level) stack.pop();
      stack.push(h);
    }

    // Only update state if the stack actually changed (prevents flicker)
    const key = stack.map((h) => h.id).join(",");
    if (key !== prevStackRef.current) {
      prevStackRef.current = key;
      setStickyStack(stack);
    }
  }, []);

  useEffect(() => {
    const container = document.querySelector(".editor-container");
    if (!container) return;
    container.addEventListener("scroll", update, { passive: true });
    const interval = setInterval(update, 1500);
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
