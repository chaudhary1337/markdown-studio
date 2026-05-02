import React, { useCallback, useEffect, useRef, useState } from "react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link as LinkIcon,
  Heading1,
  Heading2,
  Heading3,
  Type,
  Quote,
  List,
  ListOrdered,
  CheckSquare,
  ChevronDown,
} from "lucide-react";
import { BubbleLinkEditor } from "./BubbleLinkEditor";

interface Props {
  editor: Editor;
}

type BlockKind =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "blockquote"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "codeBlock";

const BLOCK_OPTIONS: { kind: BlockKind; label: string; icon: React.ReactNode }[] = [
  { kind: "paragraph", label: "Text", icon: <Type size={14} /> },
  { kind: "h1", label: "Heading 1", icon: <Heading1 size={14} /> },
  { kind: "h2", label: "Heading 2", icon: <Heading2 size={14} /> },
  { kind: "h3", label: "Heading 3", icon: <Heading3 size={14} /> },
  { kind: "h4", label: "Heading 4", icon: <Heading1 size={14} /> },
  { kind: "h5", label: "Heading 5", icon: <Heading2 size={14} /> },
  { kind: "h6", label: "Heading 6", icon: <Heading3 size={14} /> },
  { kind: "blockquote", label: "Quote", icon: <Quote size={14} /> },
  { kind: "bulletList", label: "Bullet list", icon: <List size={14} /> },
  { kind: "orderedList", label: "Numbered list", icon: <ListOrdered size={14} /> },
  { kind: "taskList", label: "Task list", icon: <CheckSquare size={14} /> },
  { kind: "codeBlock", label: "Code block", icon: <Code size={14} /> },
];

/** Button indices in the row. Kept in render order. */
const BTN_BOLD = 0;
const BTN_ITALIC = 1;
const BTN_STRIKE = 2;
const BTN_CODE = 3;
const BTN_LINK = 4;
const BTN_TURN_INTO = 5;
const BTN_COUNT = 6;

export function EditorBubbleMenu({ editor }: Props) {
  const [, forceUpdate] = useState(0);
  const [turnIntoOpen, setTurnIntoOpen] = useState(false);
  // null → menu not keyboard-focused. Number → active button index.
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [dropdownIndex, setDropdownIndex] = useState(0);
  // When true the bubble swaps its button row for the BubbleLinkEditor
  // (URL input). Keeping the link UI in-bubble matches the editor's visual
  // context and lets keyboard nav stay tight.
  const [linkMode, setLinkMode] = useState(false);
  const focusedIndexRef = useRef<number | null>(null);
  const turnIntoOpenRef = useRef(false);
  const dropdownIndexRef = useRef(0);
  // Anchor cache: keyed on selection range so bold/italic toggles (which
  // keep from/to constant but reflow glyph widths) don't shift the menu.
  // Stored relative to the editor DOM so scroll/resize still track.
  const anchorCacheRef = useRef<{
    from: number;
    to: number;
    relX: number;
    relY: number;
  } | null>(null);

  useEffect(() => {
    focusedIndexRef.current = focusedIndex;
  }, [focusedIndex]);
  useEffect(() => {
    turnIntoOpenRef.current = turnIntoOpen;
  }, [turnIntoOpen]);
  useEffect(() => {
    dropdownIndexRef.current = dropdownIndex;
  }, [dropdownIndex]);

  useEffect(() => {
    const rerender = () => forceUpdate((n) => n + 1);
    editor.on("selectionUpdate", rerender);
    editor.on("transaction", rerender);
    return () => {
      editor.off("selectionUpdate", rerender);
      editor.off("transaction", rerender);
    };
  }, [editor]);

  // Clear keyboard focus and link mode when the menu hides (selection
  // became empty or moved into an ignored block).
  useEffect(() => {
    const check = () => {
      if (editor.state.selection.empty) {
        if (focusedIndexRef.current !== null) setFocusedIndex(null);
        setTurnIntoOpen(false);
        setLinkMode(false);
      }
    };
    editor.on("selectionUpdate", check);
    return () => {
      editor.off("selectionUpdate", check);
    };
  }, [editor]);

  const enterLinkMode = useCallback(() => {
    setLinkMode(true);
    // Suspend keyboard-nav so the global keydown handler doesn't swallow
    // Enter/Escape that the URL input wants to handle.
    setFocusedIndex(null);
    setTurnIntoOpen(false);
  }, []);

  const exitLinkMode = useCallback(() => {
    setLinkMode(false);
    editor.commands.focus();
  }, [editor]);

  const isActive = useCallback(
    (name: string, attrs?: Record<string, unknown>) =>
      editor.isActive(name, attrs),
    [editor],
  );

  const applyBlock = useCallback(
    (kind: BlockKind) => {
      const chain = editor.chain().focus();
      switch (kind) {
        case "paragraph":
          chain.setParagraph().run();
          break;
        case "h1":
        case "h2":
        case "h3":
        case "h4":
        case "h5":
        case "h6":
          chain
            .setHeading({ level: Number(kind.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6 })
            .run();
          break;
        case "blockquote":
          chain.toggleBlockquote().run();
          break;
        case "bulletList":
          chain.toggleBulletList().run();
          break;
        case "orderedList":
          chain.toggleOrderedList().run();
          break;
        case "taskList":
          chain.toggleTaskList().run();
          break;
        case "codeBlock":
          chain.toggleCodeBlock().run();
          break;
      }
      setTurnIntoOpen(false);
    },
    [editor],
  );

  const runButton = useCallback(
    (idx: number) => {
      switch (idx) {
        case BTN_BOLD:
          editor.chain().focus().toggleBold().run();
          break;
        case BTN_ITALIC:
          editor.chain().focus().toggleItalic().run();
          break;
        case BTN_STRIKE:
          editor.chain().focus().toggleStrike().run();
          break;
        case BTN_CODE:
          editor.chain().focus().toggleCode().run();
          break;
        case BTN_LINK:
          enterLinkMode();
          break;
        case BTN_TURN_INTO:
          setTurnIntoOpen((v) => !v);
          setDropdownIndex(0);
          break;
      }
    },
    [editor, enterLinkMode],
  );

  // Listen for the external "enter keyboard-nav mode" event dispatched
  // from App.tsx after the shortcut selects a word.
  useEffect(() => {
    const onFocus = () => {
      if (editor.state.selection.empty) return;
      setFocusedIndex(0);
      setTurnIntoOpen(false);
    };
    window.addEventListener("btrmk:focusBubbleMenu", onFocus);
    return () => window.removeEventListener("btrmk:focusBubbleMenu", onFocus);
  }, [editor]);

  // Keyboard navigation handler — active only while focusedIndex !== null.
  useEffect(() => {
    if (focusedIndex === null) return;

    const handler = (e: KeyboardEvent) => {
      const curIdx = focusedIndexRef.current;
      if (curIdx === null) return;
      const dropdownOpen = turnIntoOpenRef.current;

      // Dropdown-level navigation
      if (dropdownOpen) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setDropdownIndex(
            (dropdownIndexRef.current + 1) % BLOCK_OPTIONS.length,
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setDropdownIndex(
            (dropdownIndexRef.current - 1 + BLOCK_OPTIONS.length) %
              BLOCK_OPTIONS.length,
          );
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          applyBlock(BLOCK_OPTIONS[dropdownIndexRef.current].kind);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setTurnIntoOpen(false);
          return;
        }
        return;
      }

      // Row-level navigation
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setFocusedIndex((curIdx + 1) % BTN_COUNT);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setFocusedIndex((curIdx - 1 + BTN_COUNT) % BTN_COUNT);
        return;
      }
      if (e.key === "ArrowDown" && curIdx === BTN_TURN_INTO) {
        e.preventDefault();
        setTurnIntoOpen(true);
        setDropdownIndex(0);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        runButton(curIdx);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setFocusedIndex(null);
        setTurnIntoOpen(false);
        // Return focus to editor; keep selection so user can resume typing.
        editor.commands.focus();
        return;
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [focusedIndex, editor, applyBlock, runButton]);

  const currentBlockLabel = (() => {
    for (let lvl = 1 as 1 | 2 | 3 | 4 | 5 | 6; lvl <= 6; lvl++) {
      if (isActive("heading", { level: lvl })) return `H${lvl}`;
    }
    if (isActive("blockquote")) return "Quote";
    if (isActive("codeBlock")) return "Code";
    if (isActive("bulletList")) return "Bullets";
    if (isActive("orderedList")) return "Numbered";
    if (isActive("taskList")) return "Tasks";
    return "Text";
  })();

  const btnClass = (idx: number, extra = "") => {
    const focused = focusedIndex === idx ? " focused" : "";
    return ("bubble-btn" + extra + focused).trim();
  };

  return (
    <BubbleMenu
      editor={editor}
      // Anchor the menu to a zero-size rect at the very end of the selection,
      // so the dropdown opens right after the last selected character and one
      // line beneath it — keeping the highlighted text fully visible.
      //
      // Cache the anchor by selection range and store it relative to the
      // editor DOM. Bold/italic toggles keep (from, to) constant but reflow
      // glyph widths slightly — without caching, the menu visibly jumps on
      // every click. Storing relative to the editor's bounding rect means
      // scrolling and resizing still track correctly because we add the
      // current editor rect on every read.
      getReferencedVirtualElement={() => {
        const { view } = editor;
        if (!view) return null;
        const { from, to } = view.state.selection;
        const editorRect = view.dom.getBoundingClientRect();
        let cache = anchorCacheRef.current;
        if (!cache || cache.from !== from || cache.to !== to) {
          const end = view.coordsAtPos(to);
          cache = {
            from,
            to,
            relX: end.right - editorRect.left,
            relY: end.bottom - editorRect.top,
          };
          anchorCacheRef.current = cache;
        }
        const left = editorRect.left + cache.relX;
        const top = editorRect.top + cache.relY;
        return {
          getBoundingClientRect: () =>
            ({
              x: left,
              y: top,
              top,
              bottom: top,
              left,
              right: left,
              width: 0,
              height: 0,
              toJSON: () => ({}),
            }) as DOMRect,
        };
      }}
      options={{ placement: "bottom-start", offset: 6 }}
      shouldShow={({ editor: e, state }) => {
        const { selection } = state;
        if (selection.empty) return false;
        if (
          e.isActive("codeBlock") ||
          e.isActive("mathInline") ||
          e.isActive("mathBlock") ||
          e.isActive("mermaidBlock") ||
          e.isActive("youtubeEmbed") ||
          e.isActive("githubEmbed") ||
          e.isActive("image")
        ) {
          return false;
        }
        return true;
      }}
      className="bubble-menu"
    >
      {linkMode ? (
        <BubbleLinkEditor editor={editor} onClose={exitLinkMode} />
      ) : (
        <>
          <button
            type="button"
            className={btnClass(BTN_BOLD, isActive("bold") ? " active" : "")}
            onClick={() => runButton(BTN_BOLD)}
            title="Bold (Cmd/Ctrl+B)"
          >
            <Bold size={14} />
          </button>
          <button
            type="button"
            className={btnClass(BTN_ITALIC, isActive("italic") ? " active" : "")}
            onClick={() => runButton(BTN_ITALIC)}
            title="Italic (Cmd/Ctrl+I)"
          >
            <Italic size={14} />
          </button>
          <button
            type="button"
            className={btnClass(BTN_STRIKE, isActive("strike") ? " active" : "")}
            onClick={() => runButton(BTN_STRIKE)}
            title="Strikethrough"
          >
            <Strikethrough size={14} />
          </button>
          <button
            type="button"
            className={btnClass(BTN_CODE, isActive("code") ? " active" : "")}
            onClick={() => runButton(BTN_CODE)}
            title="Inline code (Cmd/Ctrl+E)"
          >
            <Code size={14} />
          </button>
          <button
            type="button"
            className={btnClass(BTN_LINK, isActive("link") ? " active" : "")}
            onClick={() => runButton(BTN_LINK)}
            title={isActive("link") ? "Edit link" : "Add link"}
          >
            <LinkIcon size={14} />
          </button>
          <span className="bubble-sep" />

          <div className="bubble-turn-into">
            <button
              type="button"
              className={btnClass(BTN_TURN_INTO, " bubble-turn-into-btn")}
              onClick={() => runButton(BTN_TURN_INTO)}
              title="Turn into (↓ opens, Enter applies)"
            >
              <span>{currentBlockLabel}</span>
              <ChevronDown size={12} />
            </button>
            {turnIntoOpen && (
              <div className="bubble-dropdown">
                {BLOCK_OPTIONS.map((opt, i) => (
                  <button
                    type="button"
                    key={opt.kind}
                    className={
                      "bubble-dropdown-item" +
                      (isCurrentKind(editor, opt.kind) ? " active" : "") +
                      (focusedIndex !== null && dropdownIndex === i
                        ? " focused"
                        : "")
                    }
                    onClick={() => applyBlock(opt.kind)}
                  >
                    <span className="bubble-dropdown-icon">{opt.icon}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </BubbleMenu>
  );
}

function isCurrentKind(editor: Editor, kind: BlockKind): boolean {
  switch (kind) {
    case "paragraph":
      return (
        editor.isActive("paragraph") &&
        !editor.isActive("bulletList") &&
        !editor.isActive("orderedList") &&
        !editor.isActive("taskList") &&
        !editor.isActive("blockquote")
      );
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return editor.isActive("heading", { level: Number(kind.slice(1)) });
    case "blockquote":
      return editor.isActive("blockquote");
    case "bulletList":
      return editor.isActive("bulletList");
    case "orderedList":
      return editor.isActive("orderedList");
    case "taskList":
      return editor.isActive("taskList");
    case "codeBlock":
      return editor.isActive("codeBlock");
  }
}
