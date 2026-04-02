import React, { useEffect, useState, useRef, useCallback } from "react";

interface SearchBarProps {
  visible: boolean;
  onClose: () => void;
}

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
      clearHighlights();
      setQuery("");
      setMatchCount(0);
      setCurrentMatch(0);
    }
  }, [visible]);

  const doSearch = useCallback(() => {
    clearHighlights();
    matchRanges.current = [];

    if (!query) {
      setMatchCount(0);
      setCurrentMatch(0);
      return;
    }

    let pattern: RegExp;
    try {
      if (useRegex) {
        pattern = new RegExp(query, caseSensitive ? "g" : "gi");
      } else {
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        pattern = new RegExp(escaped, caseSensitive ? "g" : "gi");
      }
    } catch {
      setMatchCount(0);
      setCurrentMatch(0);
      return;
    }

    // Search both editor and TOC
    const containers = [
      document.querySelector(".bn-editor"),
      document.querySelector(".toc-sidebar"),
    ].filter(Boolean) as Element[];

    const ranges: Range[] = [];
    for (const container of containers) {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        const text = node.textContent || "";
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(text)) !== null) {
          if (match[0].length === 0) break; // avoid infinite loop on zero-length matches
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          ranges.push(range);
        }
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

  useEffect(() => {
    doSearch();
  }, [doSearch]);

  const navigateMatch = useCallback(
    (direction: 1 | -1) => {
      if (matchCount === 0) return;
      let next = currentMatch + direction;
      if (next > matchCount) next = 1;
      if (next < 1) next = matchCount;
      setCurrentMatch(next);
      applyHighlights(matchRanges.current, next - 1);
    },
    [currentMatch, matchCount]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter") {
      e.preventDefault();
      navigateMatch(e.shiftKey ? -1 : 1);
    }
  };

  if (!visible) return null;

  return (
    <div className="search-bar">
      <input
        ref={inputRef}
        className="search-input"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find…"
        spellCheck={false}
      />
      <span className="search-count">
        {query ? `${matchCount > 0 ? currentMatch : 0} of ${matchCount}` : ""}
      </span>
      <button
        className={`search-toggle ${caseSensitive ? "search-toggle-active" : ""}`}
        onClick={() => setCaseSensitive(!caseSensitive)}
        title="Match case"
      >
        Aa
      </button>
      <button
        className={`search-toggle ${useRegex ? "search-toggle-active" : ""}`}
        onClick={() => setUseRegex(!useRegex)}
        title="Use regex"
      >
        .*
      </button>
      <button className="search-nav" onClick={() => navigateMatch(-1)} title="Previous (Shift+Enter)">
        &#x25B2;
      </button>
      <button className="search-nav" onClick={() => navigateMatch(1)} title="Next (Enter)">
        &#x25BC;
      </button>
      <button className="search-close" onClick={onClose} title="Close (Esc)">
        &#x2715;
      </button>
    </div>
  );
}

/**
 * Apply highlights using CSS Custom Highlight API if available,
 * otherwise fall back to wrapping matches in <mark> elements.
 */
function applyHighlights(ranges: Range[], activeIndex: number) {
  if (ranges.length === 0) return;

  if ("Highlight" in window && CSS.highlights) {
    const allRanges = ranges.filter((_, i) => i !== activeIndex);
    const highlight = new Highlight(...allRanges);
    CSS.highlights.set("search-match", highlight);

    if (ranges[activeIndex]) {
      const active = new Highlight(ranges[activeIndex]);
      CSS.highlights.set("search-match-active", active);
      scrollToRange(ranges[activeIndex]);
    }
  } else {
    // Fallback: scroll to the active match
    if (ranges[activeIndex]) {
      scrollToRange(ranges[activeIndex]);
    }
  }
}

function clearHighlights() {
  if (CSS.highlights) {
    CSS.highlights.delete("search-match");
    CSS.highlights.delete("search-match-active");
  }
}

function scrollToRange(range: Range) {
  const rect = range.getBoundingClientRect();
  const container = document.querySelector(".editor-container");
  if (!container) return;

  const containerRect = container.getBoundingClientRect();
  // Only scroll if the match is not visible
  if (rect.top < containerRect.top || rect.bottom > containerRect.bottom) {
    const stickyEl = container.querySelector(".sticky-headings");
    const stickyHeight = stickyEl ? stickyEl.getBoundingClientRect().height : 0;
    const offset = rect.top - containerRect.top + container.scrollTop - stickyHeight - 60;
    container.scrollTo({ top: offset, behavior: "smooth" });
  }
}
