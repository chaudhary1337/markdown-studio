import React, { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  PanelTopOpen,
  PanelBottomOpen,
  PanelLeftOpen,
  PanelRightOpen,
  TableRowsSplit,
  TableColumnsSplit,
  Trash2,
} from "lucide-react";

interface TableControlsProps {
  editor: Editor | null;
  containerRef: React.RefObject<HTMLElement | null>;
}

interface Position {
  top: number;
  left: number;
}

// Walk up from a DOM node until we find a <table> element inside the editor.
function findTableAncestor(node: Node | null, root: HTMLElement): HTMLTableElement | null {
  let current: Node | null = node;
  while (current && current !== root) {
    if (current instanceof HTMLTableElement) return current;
    current = current.parentNode;
  }
  return null;
}

export function TableControls({ editor, containerRef }: TableControlsProps) {
  const [position, setPosition] = useState<Position | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;

    const update = () => {
      if (!editor.isEditable || !editor.isActive("table")) {
        setPosition(null);
        return;
      }
      const container = containerRef.current;
      if (!container) return;

      const { from } = editor.state.selection;
      let domNode: Node | null = null;
      try {
        domNode = editor.view.domAtPos(from).node;
      } catch {
        setPosition(null);
        return;
      }
      const table = findTableAncestor(domNode, editor.view.dom as HTMLElement);
      if (!table) {
        setPosition(null);
        return;
      }

      const tableRect = table.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      // Hide the toolbar when the table has scrolled past the visible
      // container bounds — otherwise position: fixed keeps it floating.
      if (
        tableRect.bottom < containerRect.top ||
        tableRect.top > containerRect.bottom
      ) {
        setPosition(null);
        return;
      }
      // Clamp top to the container's top edge so the toolbar stays
      // visible while scrolled inside a long table.
      const toolbarHeight = 30;
      const rawTop = tableRect.top - toolbarHeight - 2;
      const top = Math.max(containerRect.top + 4, rawTop);
      setPosition({ top, left: tableRect.right });
    };

    update();
    editor.on("selectionUpdate", update);
    editor.on("update", update);
    editor.on("transaction", update);

    const container = containerRef.current;
    container?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      editor.off("selectionUpdate", update);
      editor.off("update", update);
      editor.off("transaction", update);
      container?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [editor, containerRef]);

  if (!editor || !position) return null;

  // Prevent the toolbar from stealing focus (which would clear the table
  // selection and hide the toolbar before the click lands).
  const hold = (e: React.MouseEvent) => e.preventDefault();

  const btn = (
    title: string,
    icon: React.ReactNode,
    action: () => boolean,
  ) => (
    <button
      type="button"
      className="table-ctrl-btn"
      title={title}
      aria-label={title}
      onMouseDown={hold}
      onClick={() => {
        action();
      }}
    >
      {icon}
    </button>
  );

  return (
    <div
      ref={toolbarRef}
      className="table-controls"
      style={{ top: position.top, left: position.left }}
      onMouseDown={hold}
    >
      {btn(
        "Add row above",
        <PanelTopOpen size={14} />,
        () => editor.chain().focus().addRowBefore().run(),
      )}
      {btn(
        "Add row below",
        <PanelBottomOpen size={14} />,
        () => editor.chain().focus().addRowAfter().run(),
      )}
      <span className="table-ctrl-sep" />
      {btn(
        "Add column left",
        <PanelLeftOpen size={14} />,
        () => editor.chain().focus().addColumnBefore().run(),
      )}
      {btn(
        "Add column right",
        <PanelRightOpen size={14} />,
        () => editor.chain().focus().addColumnAfter().run(),
      )}
      <span className="table-ctrl-sep" />
      {btn(
        "Delete row",
        <TableRowsSplit size={14} />,
        () => editor.chain().focus().deleteRow().run(),
      )}
      {btn(
        "Delete column",
        <TableColumnsSplit size={14} />,
        () => editor.chain().focus().deleteColumn().run(),
      )}
      <span className="table-ctrl-sep" />
      {btn(
        "Delete table",
        <Trash2 size={14} />,
        () => editor.chain().focus().deleteTable().run(),
      )}
    </div>
  );
}
