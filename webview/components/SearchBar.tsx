import React, { useEffect, useState, useRef, useCallback } from "react";
import { Search, X, ChevronUp, ChevronDown, CaseSensitive, Regex } from "lucide-react";

declare class Highlight {
  constructor(...ranges: Range[]);
}
declare global {
  interface CSSStyleDeclaration {
    highlights?: Map<string, Highlight>;
  }
  var Highlight: typeof Highlight;
}

interface SearchBarProps {
  visible: boolean;
  onClose: () => void;
}

const supportsHighlightAPI = typeof globalThis.Highlight !== "undefined" && !!(CSS as any).highlights;

export function SearchBar({ visible, onClose }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const matchRanges = useRef<Range[]>([]);

  useEffect(() => {
    if (visible && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
    if (!visible) {
      clearAllHighlights();
      setQuery("");
      setMatchCount(0);
      setCurrentMatch(0);
    }
  }, [visible]);

  const doSearch = useCallback(() => {
    clearAllHighlights();
    matchRanges.current = [];

    if (!query) {
      setMatchCount(0);
      setCurrentMatch(0);
      return;
    }

    let pattern: RegExp;
    try {
      const src = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      pattern = new RegExp(src, caseSensitive ? "g" : "gi");
    } catch {
      setMatchCount(0);
      setCurrentMatch(0);
      return;
    }

    const container = document.querySelector(".tiptap-editor");
    if (!container) return;

    const ranges: Range[] = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const text = node.textContent || "";
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text)) !== null) {
        if (match[0].length === 0) break;
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        ranges.push(range);
      }
    }

    matchRanges.current = ranges;
    setMatchCount(ranges.length);
    if (ranges.length > 0) {
      setCurrentMatch(1);
      applyHighlights(ranges, 0);
    } else {
      setCurrentMatch(0);
    }
  }, [query, caseSensitive, useRegex]);

  useEffect(() => { doSearch(); }, [doSearch]);

  const navigateMatch = useCallback((direction: 1 | -1) => {
    if (matchCount === 0) return;
    let next = currentMatch + direction;
    if (next > matchCount) next = 1;
    if (next < 1) next = matchCount;
    setCurrentMatch(next);
    applyHighlights(matchRanges.current, next - 1);
  }, [currentMatch, matchCount]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation(); // prevent ProseMirror from capturing
    if (e.key === "Escape") onClose();
    else if (e.key === "Enter") { e.preventDefault(); navigateMatch(e.shiftKey ? -1 : 1); }
  };

  if (!visible) return null;

  return (
    <div className="search-bar">
      <Search size={13} className="search-icon" />
      <input
        ref={inputRef}
        className="search-input"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in document"
        spellCheck={false}
      />
      <span className="search-count">
        {query ? `${matchCount > 0 ? currentMatch : 0}/${matchCount}` : ""}
      </span>
      <button
        className={`search-toggle ${caseSensitive ? "search-toggle-active" : ""}`}
        onClick={() => setCaseSensitive(!caseSensitive)}
        title="Match case"
      ><CaseSensitive size={14} /></button>
      <button
        className={`search-toggle ${useRegex ? "search-toggle-active" : ""}`}
        onClick={() => setUseRegex(!useRegex)}
        title="Use regex"
      ><Regex size={14} /></button>
      <button className="search-nav" onClick={() => navigateMatch(-1)} title="Previous (Shift+Enter)">
        <ChevronUp size={14} />
      </button>
      <button className="search-nav" onClick={() => navigateMatch(1)} title="Next (Enter)">
        <ChevronDown size={14} />
      </button>
      <button className="search-close" onClick={onClose} title="Close (Esc)">
        <X size={14} />
      </button>
    </div>
  );
}

function applyHighlights(ranges: Range[], activeIndex: number) {
  if (ranges.length === 0) return;
  clearMarkElements();

  if (supportsHighlightAPI) {
    const highlights = (CSS as any).highlights as Map<string, Highlight>;
    const inactive = ranges.filter((_, i) => i !== activeIndex);
    if (inactive.length > 0) highlights.set("search-match", new Highlight(...inactive));
    if (ranges[activeIndex]) highlights.set("search-match-active", new Highlight(ranges[activeIndex]));
  } else {
    for (let i = ranges.length - 1; i >= 0; i--) {
      try {
        const mark = document.createElement("mark");
        mark.className = i === activeIndex ? "search-mark-active" : "search-mark";
        mark.dataset.searchMark = "true";
        ranges[i].surroundContents(mark);
      } catch { /* skip cross-boundary ranges */ }
    }
  }
  if (ranges[activeIndex]) scrollToRange(ranges[activeIndex]);
}

function clearAllHighlights() {
  if (supportsHighlightAPI) {
    const highlights = (CSS as any).highlights as Map<string, Highlight> | undefined;
    highlights?.delete("search-match");
    highlights?.delete("search-match-active");
  }
  clearMarkElements();
}

function clearMarkElements() {
  document.querySelectorAll("[data-search-mark]").forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
  });
}

function scrollToRange(range: Range) {
  const rect = range.getBoundingClientRect();
  const container = document.querySelector(".editor-container");
  if (!container) return;
  const containerRect = container.getBoundingClientRect();
  if (rect.top < containerRect.top || rect.bottom > containerRect.bottom) {
    const stickyEl = container.querySelector(".sticky-headings");
    const stickyHeight = stickyEl ? stickyEl.getBoundingClientRect().height : 0;
    const offset = rect.top - containerRect.top + container.scrollTop - stickyHeight - 60;
    container.scrollTo({ top: offset, behavior: "smooth" });
  }
}
