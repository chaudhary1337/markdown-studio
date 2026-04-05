/**
 * acquireVsCodeApi() may be called AT MOST ONCE per webview. Both App.tsx
 * and DiffApp.tsx are bundled together, so if each module calls it at
 * import time the second call throws
 * "An instance of the VS Code API has already been acquired".
 *
 * This module funnels both through a single lazy call, guarded by a
 * global so even hot-module-reload / duplicate imports don't double-call.
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

export const vscodeApi: VsCodeApi = (() => {
  const w = window as any;
  if (w[KEY]) return w[KEY];
  const api = acquireVsCodeApi();
  w[KEY] = api;
  return api;
})();
