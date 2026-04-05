import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { DiffApp } from "./DiffApp";

const container = document.getElementById("root")!;
const root = createRoot(container);

// Host sets window.__BTRMK_MODE__ in the webview HTML before loading this
// bundle. "diff" → standalone diff panel; anything else → full editor.
const mode = (window as any).__BTRMK_MODE__;
root.render(mode === "diff" ? <DiffApp /> : <App />);
