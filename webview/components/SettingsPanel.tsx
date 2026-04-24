import React from "react";
import {
  DEFAULT_SETTINGS,
  type BetterMarkdownSettings,
} from "../settings";

interface SettingsPanelProps {
  visible: boolean;
  settings: BetterMarkdownSettings;
  onChange: (next: BetterMarkdownSettings) => void;
  onClose: () => void;
}

export function SettingsPanel({
  visible,
  settings,
  onChange,
  onClose,
}: SettingsPanelProps) {
  if (!visible) return null;

  const set = <K extends keyof BetterMarkdownSettings>(
    key: K,
    value: BetterMarkdownSettings[K],
  ) => onChange({ ...settings, [key]: value });

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Markdown Settings</h2>
          <button
            className="settings-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        <div className="settings-body">
          <section>
            <h3>Saving</h3>

            <Toggle
              label="Save normalization on open (silently persists the md → html → md round-trip)"
              checked={settings.autoSave}
              onChange={(v) => set("autoSave", v)}
            />
          </section>

          <section>
            <h3>Serialization</h3>

            <Row label="Bullet marker">
              <Segmented
                value={settings.bullet}
                options={[
                  { value: "-", label: "- dash" },
                  { value: "*", label: "* star" },
                  { value: "+", label: "+ plus" },
                ]}
                onChange={(v) => set("bullet", v as "-" | "*" | "+")}
              />
            </Row>

            <Row label="Italic marker">
              <Segmented
                value={settings.emphasis}
                options={[
                  { value: "_", label: "_italic_" },
                  { value: "*", label: "*italic*" },
                ]}
                onChange={(v) => set("emphasis", v as "_" | "*")}
              />
            </Row>

            <Row label="Bold marker">
              <Segmented
                value={settings.strong}
                options={[
                  { value: "**", label: "**bold**" },
                  { value: "__", label: "__bold__" },
                ]}
                onChange={(v) => set("strong", v as "**" | "__")}
              />
            </Row>

            <Row label="Horizontal rule">
              <Segmented
                value={settings.rule}
                options={[
                  { value: "-", label: "---" },
                  { value: "*", label: "***" },
                  { value: "_", label: "___" },
                ]}
                onChange={(v) => set("rule", v as "-" | "*" | "_")}
              />
            </Row>

            <Row label="List indent">
              <Segmented
                value={settings.listItemIndent}
                options={[
                  { value: "one", label: "1 space" },
                  { value: "tab", label: "tab" },
                  { value: "mixed", label: "mixed" },
                ]}
                onChange={(v) =>
                  set("listItemIndent", v as "one" | "tab" | "mixed")
                }
              />
            </Row>
          </section>

          <section>
            <h3>Appearance</h3>

            <Row label="Editor surface">
              <Segmented
                value={settings.editorSurface}
                options={[
                  { value: "editor", label: "Default" },
                  { value: "sideBar", label: "Sidebar" },
                  { value: "panel", label: "Panel" },
                  { value: "input", label: "Input" },
                  { value: "editorWidget", label: "Widget" },
                  { value: "textBlockQuote", label: "Quote" },
                  { value: "custom", label: "Custom" },
                ]}
                onChange={(v) =>
                  set(
                    "editorSurface",
                    v as BetterMarkdownSettings["editorSurface"],
                  )
                }
              />
            </Row>

            {settings.editorSurface === "custom" && (
              <Row label="Custom hex">
                <input
                  type="text"
                  className="settings-input"
                  value={settings.editorSurfaceCustom}
                  placeholder="#1e1e1e"
                  onChange={(e) =>
                    set("editorSurfaceCustom", e.target.value)
                  }
                />
              </Row>
            )}
          </section>

          <section>
            <h3>Code blocks</h3>

            <Row label="Default language label">
              <input
                type="text"
                className="settings-input"
                value={settings.defaultCodeBlockLang}
                placeholder="(leave empty for bare ```)"
                onChange={(e) => set("defaultCodeBlockLang", e.target.value)}
              />
            </Row>
          </section>

          <section>
            <h3>Diff view</h3>

            <Row label="Default mode">
              <Segmented
                value={settings.diffMode}
                options={[
                  { value: "source", label: "Source" },
                  { value: "rendered", label: "Rendered" },
                ]}
                onChange={(v) => set("diffMode", v as "source" | "rendered")}
              />
            </Row>

            <Row label="Source layout">
              <Segmented
                value={settings.diffLayout}
                options={[
                  { value: "unified", label: "Unified" },
                  { value: "side-by-side", label: "Side-by-side" },
                ]}
                onChange={(v) =>
                  set("diffLayout", v as "unified" | "side-by-side")
                }
              />
            </Row>
          </section>

          <section>
            <h3>Normalization (toggle to disable)</h3>

            <Toggle
              label="Compact lists (remove blank lines between items)"
              checked={settings.compactLists}
              onChange={(v) => set("compactLists", v)}
            />
            <Toggle
              label="Unescape \~, \*, \_, \[ added by remark-stringify"
              checked={settings.unescapeSpecialChars}
              onChange={(v) => set("unescapeSpecialChars", v)}
            />
            <Toggle
              label="Renumber ordered lists (1. 2. 3. …)"
              checked={settings.renumberOrderedLists}
              onChange={(v) => set("renumberOrderedLists", v)}
            />
            <Toggle
              label="Rewrite shellscript → bash"
              checked={settings.shellscriptToBash}
              onChange={(v) => set("shellscriptToBash", v)}
            />
            <Toggle
              label="Rebuild table headers (from empty-header-row output)"
              checked={settings.fixTableHeaders}
              onChange={(v) => set("fixTableHeaders", v)}
            />
            <Toggle
              label="Dedupe image alt text line (![alt](x)\\nalt → ![alt](x))"
              checked={settings.dedupImageAltText}
              onChange={(v) => set("dedupImageAltText", v)}
            />
          </section>
        </div>

        <div className="settings-footer">
          <button
            className="settings-reset"
            onClick={() => onChange(DEFAULT_SETTINGS)}
          >
            Reset to defaults
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-row">
      <span className="settings-row-label">{label}</span>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="settings-segmented">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={
            "settings-segment" + (opt.value === value ? " active" : "")
          }
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="settings-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
