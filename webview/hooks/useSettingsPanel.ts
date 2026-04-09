import { useRef, useState, useCallback } from "react";
import type { MutableRefObject } from "react";
import { DEFAULT_SETTINGS, type BetterMarkdownSettings } from "../settings";
import { vscodeApi } from "../vscode-api";

export function useSettingsPanel(
  handleUpdateRef: MutableRefObject<() => void>,
) {
  const settingsRef = useRef<BetterMarkdownSettings>(DEFAULT_SETTINGS);
  const [settings, setSettings] =
    useState<BetterMarkdownSettings>(DEFAULT_SETTINGS);
  const [settingsVisible, setSettingsVisible] = useState(false);

  const updateSettings = useCallback(
    (next: BetterMarkdownSettings) => {
      settingsRef.current = next;
      setSettings(next);
      vscodeApi.postMessage({ type: "saveSettings", settings: next });
      handleUpdateRef.current();
    },
    [handleUpdateRef],
  );

  /** Apply settings from an external source (e.g. init message) without
   *  triggering a re-serialization of the document. */
  const applySettings = useCallback((s: BetterMarkdownSettings) => {
    settingsRef.current = s;
    setSettings(s);
  }, []);

  return {
    settings,
    settingsRef,
    settingsVisible,
    setSettingsVisible,
    updateSettings,
    applySettings,
  };
}
