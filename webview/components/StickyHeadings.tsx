import React, { useEffect, useState, useCallback } from "react";
import { BlockNoteEditor, Block } from "@blocknote/core";

interface StickyHeading {
  id: string;
  text: string;
  level: number;
}

export function StickyHeadings({ editor }: { editor: BlockNoteEditor }) {
  const [stickyStack, setStickyStack] = useState<StickyHeading[]>([]);

  const updateStickyHeadings = useCallback(() => {
    const editorElement = document.querySelector(".bn-editor");
    if (!editorElement) return;

    // Find all heading DOM elements that are above the viewport
    const headingEls = editorElement.querySelectorAll(
      '[data-content-type="heading"]'
    );
    const containerRect = editorElement.getBoundingClientRect();
    const scrollTop = editorElement.scrollTop;

    const aboveViewport: StickyHeading[] = [];

    headingEls.forEach((el) => {
      const rect = el.getBoundingClientRect();
      // Heading is above or at the top of the visible area
      if (rect.top < containerRect.top + 4) {
        const level = parseInt(el.getAttribute("data-level") || "1", 10);
        const text = el.textContent || "";
        const id = el.getAttribute("data-id") || "";
        if (text.trim()) {
          aboveViewport.push({ id, text: text.trim(), level });
        }
      }
    });

    // Build hierarchy stack: keep only the most recent heading at each level
    // and remove any lower-level headings that come before a higher-level one
    const stack: StickyHeading[] = [];
    for (const h of aboveViewport) {
      // Remove headings of same or lower priority (higher or equal level number)
      while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
        stack.pop();
      }
      stack.push(h);
    }

    setStickyStack(stack);
  }, [editor]);

  useEffect(() => {
    const editorElement = document.querySelector(".bn-editor");
    if (!editorElement) return;

    // Update on scroll
    editorElement.addEventListener("scroll", updateStickyHeadings, {
      passive: true,
    });
    // Also update periodically to catch content changes
    const interval = setInterval(updateStickyHeadings, 1000);

    return () => {
      editorElement.removeEventListener("scroll", updateStickyHeadings);
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
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
