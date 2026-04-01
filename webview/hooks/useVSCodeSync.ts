import { useMemo } from "react";

interface VSCodeAPI {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VSCodeAPI;

let vscodeApi: VSCodeAPI | null = null;

function getVSCodeAPI(): VSCodeAPI {
  if (!vscodeApi) {
    vscodeApi = acquireVsCodeApi();
  }
  return vscodeApi;
}

export function useVSCodeSync() {
  return useMemo(() => getVSCodeAPI(), []);
}
