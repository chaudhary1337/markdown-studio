import React, { useEffect, useState, useCallback, useRef } from "react";
import { GripVertical, ChevronLeft, ChevronRight, Filter } from "lucide-react";

/** Scroll to the Nth heading element in the editor. */
function scrollToHeadingByIndex(index: number) {
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
}

interface TocEntry {
  id: string;
  text: string;
  level: number;
}

const COLLAPSE_THRESHOLD = 80;
const MIN_WIDTH = 120;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 200;

export function TableOfContents() {
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const lastOpenWidth = useRef(DEFAULT_WIDTH);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const wasCollapsed = useRef(false);

  const updateToc = useCallback(() => {
    const container = document.querySelector(".editor-container");
    if (!container) return;

    const headingEls = container.querySelectorAll(
      ".tiptap-editor h1, .tiptap-editor h2, .tiptap-editor h3, .tiptap-editor h4, .tiptap-editor h5, .tiptap-editor h6"
    );

    // Use index as identifier — never modify the editor DOM
    const newEntries: TocEntry[] = [];
    headingEls.forEach((el, index) => {
      const text = el.textContent?.trim();
      if (text) {
        newEntries.push({ id: String(index), text, level: parseInt(el.tagName[1], 10) });
      }
    });
    setEntries(newEntries);

    const containerRect = container.getBoundingClientRect();
    let closestId: string | null = null;
    let closestDist = Infinity;
    headingEls.forEach((el, index) => {
      const rect = el.getBoundingClientRect();
      const dist = Math.abs(rect.top - containerRect.top);
      if (rect.top <= containerRect.top + 100 && dist < closestDist) {
        closestDist = dist;
        closestId = String(index);
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
      const raw = startWidth.current + (startX.current - e.clientX);

      if (wasCollapsed.current) {
        if (raw >= COLLAPSE_THRESHOLD) {
          const w = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, raw));
          setCollapsed(false);
          setWidth(w);
          lastOpenWidth.current = w;
        }
      } else if (raw < COLLAPSE_THRESHOLD) {
        setCollapsed(true);
      } else {
        const w = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, raw));
        setCollapsed(false);
        setWidth(w);
        lastOpenWidth.current = w;
      }
    };

    const stopDrag = () => {
      if (!dragging.current) return;
      dragging.current = false;
      wasCollapsed.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    const onMouseLeave = (e: MouseEvent) => {
      if (!dragging.current) return;
      if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
        stopDrag();
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", stopDrag);
    document.addEventListener("mouseleave", onMouseLeave);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", stopDrag);
      document.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  const onHandleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    wasCollapsed.current = collapsed;
    startX.current = e.clientX;
    startWidth.current = collapsed ? 0 : width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  if (entries.length === 0) return null;

  return (
    <>
      <div
        className={`toc-handle ${collapsed ? "toc-handle-collapsed" : ""}`}
        onMouseDown={onHandleMouseDown}
        title={collapsed ? "Drag or click to show contents" : "Drag to resize"}
      >
        {collapsed ? (
          <ChevronLeft
            size={14}
            className="toc-expand-icon"
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed(false);
              setWidth(Math.max(lastOpenWidth.current, DEFAULT_WIDTH));
            }}
          />
        ) : (
          <>
            <ChevronRight
              size={12}
              className="toc-collapse-btn"
              onClick={(e) => { e.stopPropagation(); setCollapsed(true); }}
            />
            <GripVertical size={12} className="toc-grip" />
          </>
        )}
      </div>
      {!collapsed && (
        <div className="toc-sidebar" style={{ width }}>
          <div className="toc-title">Contents</div>
          <div className="toc-filter-wrap">
            <Filter size={11} className="toc-filter-icon" />
            <input
              className="toc-filter"
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter headings"
              spellCheck={false}
            />
          </div>
          {entries
            .filter((e) => !filter || e.text.toLowerCase().includes(filter.toLowerCase()))
            .map((entry) => (
              <div
                key={entry.id}
                className={`toc-entry toc-entry-h${entry.level}${entry.id === activeId ? " toc-active" : ""}`}
                onClick={() => scrollToHeadingByIndex(parseInt(entry.id, 10))}
                role="button"
                tabIndex={0}
              >
                {entry.text.length > 128 ? entry.text.slice(0, 128) + "\u2026" : entry.text}
              </div>
            ))}
        </div>
      )}
    </>
  );
}
