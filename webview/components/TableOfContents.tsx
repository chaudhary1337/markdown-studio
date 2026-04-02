import React, { useEffect, useState, useCallback, useRef } from "react";
import { BlockNoteEditor } from "@blocknote/core";
import { GripVertical, ChevronLeft, ChevronRight } from "lucide-react";
import { getHeadingLevel, scrollToBlock } from "../utils";

interface TocEntry {
  id: string;
  text: string;
  level: number;
}

const COLLAPSE_THRESHOLD = 80;
const MIN_WIDTH = 120;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 200;

export function TableOfContents({ editor }: { editor: BlockNoteEditor }) {
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
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

    const headingEls = container.querySelectorAll('[data-content-type="heading"]');
    const newEntries: TocEntry[] = [];
    headingEls.forEach((el, index) => {
      const text = el.textContent?.trim();
      if (text) {
        const id = el.closest("[data-id]")?.getAttribute("data-id") || `toc-${index}`;
        newEntries.push({ id, text, level: getHeadingLevel(el) });
      }
    });
    setEntries(newEntries);

    const containerRect = container.getBoundingClientRect();
    let closestId: string | null = null;
    let closestDist = Infinity;
    headingEls.forEach((el, index) => {
      const rect = el.getBoundingClientRect();
      const dist = Math.abs(rect.top - containerRect.top);
      const id = el.closest("[data-id]")?.getAttribute("data-id") || `toc-${index}`;
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
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={`toc-entry toc-entry-h${entry.level}${entry.id === activeId ? " toc-active" : ""}`}
              onClick={() => scrollToBlock(entry.id)}
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
