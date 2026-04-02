import React, { useEffect, useState, useCallback, useRef } from "react";

interface StickyHeading {
  index: number;
  text: string;
  level: number;
}

export function StickyHeadings() {
  const [stickyStack, setStickyStack] = useState<StickyHeading[]>([]);
  const prevKeyRef = useRef("");

  const update = useCallback(() => {
    const container = document.querySelector(".editor-container");
    if (!container) return;

    const headingEls = container.querySelectorAll(
      ".tiptap-editor h1, .tiptap-editor h2, .tiptap-editor h3, .tiptap-editor h4, .tiptap-editor h5, .tiptap-editor h6"
    );
    const containerRect = container.getBoundingClientRect();
    const stickyEl = container.querySelector(".sticky-headings");
    const stickyHeight = stickyEl ? stickyEl.getBoundingClientRect().height : 0;
    const threshold = containerRect.top + stickyHeight + 12;

    const aboveViewport: StickyHeading[] = [];
    headingEls.forEach((el, index) => {
      if (el.getBoundingClientRect().bottom < threshold) {
        const text = el.textContent?.trim();
        if (text) {
          aboveViewport.push({ index, text, level: parseInt(el.tagName[1], 10) });
        }
      }
    });

    const stack: StickyHeading[] = [];
    for (const h of aboveViewport) {
      while (stack.length > 0 && stack[stack.length - 1].level >= h.level) stack.pop();
      stack.push(h);
    }

    const key = stack.map((h) => `${h.index}:${h.text}`).join("|");
    if (key !== prevKeyRef.current) {
      prevKeyRef.current = key;
      setStickyStack(stack);
    }
  }, []);

  useEffect(() => {
    const container = document.querySelector(".editor-container");
    if (!container) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    const interval = setInterval(update, 2000);
    return () => {
      container.removeEventListener("scroll", onScroll);
      clearInterval(interval);
      cancelAnimationFrame(raf);
    };
  }, [update]);

  const scrollToHeading = (index: number) => {
    const container = document.querySelector(".editor-container");
    if (!container) return;
    const headings = container.querySelectorAll(
      ".tiptap-editor h1, .tiptap-editor h2, .tiptap-editor h3, .tiptap-editor h4, .tiptap-editor h5, .tiptap-editor h6"
    );
    const el = headings[index];
    if (!el) return;
    const stickyEl = container.querySelector(".sticky-headings");
    const stickyHeight = stickyEl ? stickyEl.getBoundingClientRect().height : 0;
    const elTop = el.getBoundingClientRect().top;
    const containerTop = container.getBoundingClientRect().top;
    const offset = elTop - containerTop + container.scrollTop - stickyHeight;
    container.scrollTo({ top: offset, behavior: "smooth" });
  };

  if (stickyStack.length === 0) return null;

  return (
    <div className="sticky-headings">
      {stickyStack.map((h) => (
        <div
          key={h.index}
          className={`sticky-heading sticky-heading-h${h.level}`}
          onClick={() => scrollToHeading(h.index)}
          role="button"
          tabIndex={0}
        >
          {h.text}
        </div>
      ))}
    </div>
  );
}
