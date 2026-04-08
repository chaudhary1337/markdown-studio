import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { Extension } from "@tiptap/core";
import { Suggestion } from "@tiptap/suggestion";
import {
  Heading1, Heading2, Heading3, Heading4, Heading5, Heading6,
  List, ListOrdered, CheckSquare, Code, Quote, Minus, Table, ImageIcon, Type,
  Sigma,
} from "lucide-react";

interface SlashItem {
  title: string;
  icon: React.ReactNode;
  command: (editor: any) => void;
}

const ITEMS: SlashItem[] = [
  { title: "Text", icon: <Type size={16} />, command: (e) => e.chain().focus().setParagraph().run() },
  { title: "Heading 1", icon: <Heading1 size={16} />, command: (e) => e.chain().focus().setHeading({ level: 1 }).run() },
  { title: "Heading 2", icon: <Heading2 size={16} />, command: (e) => e.chain().focus().setHeading({ level: 2 }).run() },
  { title: "Heading 3", icon: <Heading3 size={16} />, command: (e) => e.chain().focus().setHeading({ level: 3 }).run() },
  { title: "Heading 4", icon: <Heading4 size={16} />, command: (e) => e.chain().focus().setHeading({ level: 4 }).run() },
  { title: "Heading 5", icon: <Heading5 size={16} />, command: (e) => e.chain().focus().setHeading({ level: 5 }).run() },
  { title: "Heading 6", icon: <Heading6 size={16} />, command: (e) => e.chain().focus().setHeading({ level: 6 }).run() },
  { title: "Bullet List", icon: <List size={16} />, command: (e) => e.chain().focus().toggleBulletList().run() },
  { title: "Numbered List", icon: <ListOrdered size={16} />, command: (e) => e.chain().focus().toggleOrderedList().run() },
  { title: "Task List", icon: <CheckSquare size={16} />, command: (e) => e.chain().focus().toggleTaskList().run() },
  { title: "Code Block", icon: <Code size={16} />, command: (e) => e.chain().focus().toggleCodeBlock().run() },
  { title: "Blockquote", icon: <Quote size={16} />, command: (e) => e.chain().focus().toggleBlockquote().run() },
  { title: "Horizontal Rule", icon: <Minus size={16} />, command: (e) => e.chain().focus().setHorizontalRule().run() },
  { title: "Table", icon: <Table size={16} />, command: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { title: "Math Block", icon: <Sigma size={16} />, command: (e) => e.chain().focus().insertContent({ type: "mathBlock", attrs: { latex: "" } }).run() },
  { title: "Inline Math", icon: <Sigma size={16} />, command: (e) => e.chain().focus().insertContent({ type: "mathInline", attrs: { latex: "" } }).run() },
  { title: "Image", icon: <ImageIcon size={16} />, command: () => {
    window.dispatchEvent(new CustomEvent("btrmk:showImageDialog"));
  }},
];

function SlashMenu({ items, selectedIndex, onSelect }: {
  items: SlashItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const active = menuRef.current?.querySelector(".slash-item-active");
    if (active) active.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (items.length === 0) return null;

  return (
    <div className="slash-menu" ref={menuRef}>
      {items.map((item, i) => (
        <div
          key={item.title}
          className={`slash-item ${i === selectedIndex ? "slash-item-active" : ""}`}
          onClick={() => onSelect(i)}
        >
          <span className="slash-item-icon">{item.icon}</span>
          {item.title}
        </div>
      ))}
    </div>
  );
}

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addOptions() {
    return { suggestion: {} };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: "/",
        startOfLine: true,
        command: ({ editor, range, props }: any) => {
          editor.chain().focus().deleteRange(range).run();
          props.command(editor);
        },
        items: ({ query }: { query: string }) => {
          return ITEMS.filter((item) =>
            item.title.toLowerCase().includes(query.toLowerCase())
          );
        },
        render: () => {
          let popup: HTMLDivElement | null = null;
          let root: any = null;
          let selectedIndex = 0;
          let currentItems: SlashItem[] = [];

          const render = () => {
            if (!popup || !root) return;
            root.render(
              <SlashMenu
                items={currentItems}
                selectedIndex={selectedIndex}
                onSelect={(i) => {
                  // Trigger the command via the props callback
                  (popup as any)?._onSelect?.(i);
                }}
              />
            );
          };

          let scrollHandler: (() => void) | null = null;
          let currentProps: any = null;

          const reposition = () => {
            if (!popup || !currentProps) return;
            try {
              const { view } = currentProps.editor;
              const coords = view.coordsAtPos(currentProps.range.from);
              popup.style.left = `${coords.left}px`;
              popup.style.top = `${coords.bottom + 4}px`;
            } catch { /* pos may be stale */ }
          };

          return {
            onStart: (props: any) => {
              currentProps = props;
              popup = document.createElement("div");
              popup.className = "slash-popup";
              root = createRoot(popup);
              currentItems = props.items;
              selectedIndex = 0;

              (popup as any)._onSelect = (i: number) => {
                props.command({ command: currentItems[i].command });
              };

              render();
              document.body.appendChild(popup);
              reposition();

              // Reposition on scroll so menu follows the cursor
              scrollHandler = () => reposition();
              const container = document.querySelector(".editor-container");
              if (container) container.addEventListener("scroll", scrollHandler, { passive: true });
            },
            onUpdate: (props: any) => {
              currentProps = props;
              currentItems = props.items;
              selectedIndex = 0;

              (popup as any)._onSelect = (i: number) => {
                props.command({ command: currentItems[i].command });
              };

              render();
              reposition();
            },
            onKeyDown: ({ event }: { event: KeyboardEvent }) => {
              if (event.key === "ArrowDown") {
                selectedIndex = (selectedIndex + 1) % currentItems.length;
                render();
                return true;
              }
              if (event.key === "ArrowUp") {
                selectedIndex = (selectedIndex - 1 + currentItems.length) % currentItems.length;
                render();
                return true;
              }
              if (event.key === "Enter") {
                if (currentItems[selectedIndex]) {
                  (popup as any)?._onSelect?.(selectedIndex);
                }
                return true;
              }
              return false;
            },
            onExit: () => {
              if (scrollHandler) {
                const container = document.querySelector(".editor-container");
                if (container) container.removeEventListener("scroll", scrollHandler);
                scrollHandler = null;
              }
              if (root) root.unmount();
              if (popup) popup.remove();
              popup = null;
              root = null;
            },
          };
        },
      }),
    ];
  },
});
