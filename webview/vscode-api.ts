/**
 * Unified API shim that works in both VS Code webviews and standalone
 * browser mode.
 *
 * VS Code: acquireVsCodeApi() exists → use it directly.
 * Browser: no VS Code runtime → open a WebSocket to the dev server and
 *          route postMessage/addEventListener("message") over it so
 *          App.tsx works unchanged.
 */

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

const KEY = "__BTRMK_VSCODE_API__";

function createBrowserShim(): VsCodeApi {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  // The HTML embeds __BTRMK_FILE__; fall back to parsing /edit/<path> from URL.
  const file =
    (window as any).__BTRMK_FILE__ ||
    (location.pathname.startsWith("/edit/") ? "/" + location.pathname.slice("/edit/".length) : "");
  const ws = new WebSocket(`${protocol}//${location.host}/ws${file}`);
  let state: unknown = null;

  ws.addEventListener("message", (ev) => {
    try {
      const data = JSON.parse(ev.data);
      // Dispatch as a MessageEvent on window so existing
      // window.addEventListener("message", ...) handlers in App.tsx pick it up.
      window.dispatchEvent(new MessageEvent("message", { data }));
    } catch { /* ignore malformed frames */ }
  });

  return {
    postMessage(msg: unknown) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      } else {
        // Queue until open
        ws.addEventListener("open", () => ws.send(JSON.stringify(msg)), { once: true });
      }
    },
    getState() { return state; },
    setState(s: unknown) { state = s; },
  };
}

function isVsCodeWebview(): boolean {
  try {
    return typeof acquireVsCodeApi === "function";
  } catch {
    return false;
  }
}

export const isBrowserMode = !isVsCodeWebview();

export const vscodeApi: VsCodeApi = (() => {
  const w = window as any;
  if (w[KEY]) return w[KEY];

  const api = isBrowserMode ? createBrowserShim() : acquireVsCodeApi();
  w[KEY] = api;
  return api;
})();
