import React, { useEffect, useState, useCallback, useRef } from "react";
import { BlockNoteEditor } from "@blocknote/core";

interface TocEntry {
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

const MIN_WIDTH = 120;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 200;

export function TableOfContents({ editor }: { editor: BlockNoteEditor }) {
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const updateToc = useCallback(() => {
    const container = document.querySelector(".editor-container");
    if (!container) return;

    const headingEls = container.querySelectorAll(
      '[data-content-type="heading"]'
    );

    const newEntries: TocEntry[] = [];
    headingEls.forEach((el, index) => {
      const level = getHeadingLevel(el);
      const text = el.textContent || "";
      const blockWrapper = el.closest("[data-id]");
      const id = blockWrapper?.getAttribute("data-id") || `toc-${index}`;
      if (text.trim()) {
        newEntries.push({ id, text: text.trim(), level });
      }
    });
    setEntries(newEntries);

    const containerRect = container.getBoundingClientRect();
    let closestId: string | null = null;
    let closestDist = Infinity;
    headingEls.forEach((el, index) => {
      const rect = el.getBoundingClientRect();
      const dist = Math.abs(rect.top - containerRect.top);
      const blockWrapper = el.closest("[data-id]");
      const id = blockWrapper?.getAttribute("data-id") || `toc-${index}`;
      if (rect.top <= containerRect.top + 100 && dist < closestDist) {
        closestDist = dist;
        closestId = id;
      }
    });
    setActiveId(closestId);
  }, []);

  useEffect(() => {
    const container = document.querySelector(".editor-container");
    if (!container) return;

    container.addEventListener("scroll", updateToc, { passive: true });
    const interval = setInterval(updateToc, 1000);
    setTimeout(updateToc, 500);

    return () => {
      container.removeEventListener("scroll", updateToc);
      clearInterval(interval);
    };
  }, [updateToc]);

  // Drag resize handlers
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      // Dragging left edge: moving left = wider, moving right = narrower
      const delta = startX.current - e.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
      setWidth(newWidth);
    };
    const onMouseUp = () => {
      if (dragging.current) {
        dragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const onHandleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  if (entries.length === 0) return null;

  return (
    <>
      <div
        className="toc-handle"
        onMouseDown={collapsed ? undefined : onHandleMouseDown}
        onClick={collapsed ? () => setCollapsed(false) : undefined}
        title={collapsed ? "Show table of contents" : "Drag to resize"}
      >
        <span
          className="toc-collapse-btn"
          onClick={(e) => {
            e.stopPropagation();
            setCollapsed(!collapsed);
          }}
          title={collapsed ? "Show contents" : "Hide contents"}
        >
          {collapsed ? "\u25C0" : "\u25B6"}
        </span>
      </div>
      {!collapsed && (
        <div className="toc-sidebar" style={{ width }}>
          <div className="toc-title">Contents</div>
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={`toc-entry toc-entry-h${entry.level}${entry.id === activeId ? " toc-active" : ""}`}
              onClick={() => scrollToEntry(entry.id)}
              role="button"
              tabIndex={0}
            >
              {entry.text}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function scrollToEntry(id: string) {
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
