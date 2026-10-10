import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";

const CUSTOM_CSS_SETTING = "markdownStudio.customCss";

/**
 * Resolve `markdownStudio.customCss` to an absolute path. Accepts absolute
 * paths, `~/...`, and paths relative to the first workspace folder.
 * Returns null when the setting is empty or unresolvable.
 */
function resolveCustomCssPath(): string | null {
  const raw = vscode.workspace
    .getConfiguration()
    .get<string>(CUSTOM_CSS_SETTING, "")
    .trim();
  if (!raw) return null;
  if (raw === "~" || raw.startsWith("~/")) {
    return path.join(os.homedir(), raw.slice(1));
  }
  if (path.isAbsolute(raw)) return raw;
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  return root ? path.join(root, raw) : null;
}

/**
 * Read the user's custom stylesheet. The webview injects it as a `<style>`
 * tag (CSP allows inline styles), so the file can live anywhere on disk
 * without widening `localResourceRoots`. Missing / unreadable files yield
 * an empty string so a bad path never breaks the editor.
 */
export async function readCustomCss(): Promise<string> {
  const file = resolveCustomCssPath();
  if (!file) return "";
  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(file));
    return Buffer.from(bytes).toString("utf-8");
  } catch {
    return "";
  }
}

/**
 * Fire `listener` when the custom stylesheet changes: either the setting
 * points somewhere new, or the file itself is created / saved / deleted.
 */
export function onCustomCssChange(listener: () => void): vscode.Disposable {
  let watcher: vscode.FileSystemWatcher | undefined;
  const rewatch = () => {
    watcher?.dispose();
    watcher = undefined;
    const file = resolveCustomCssPath();
    if (!file) return;
    watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        vscode.Uri.file(path.dirname(file)),
        path.basename(file),
      ),
    );
    watcher.onDidChange(listener);
    watcher.onDidCreate(listener);
    watcher.onDidDelete(listener);
  };
  rewatch();
  const configSub = vscode.workspace.onDidChangeConfiguration((e) => {
    if (!e.affectsConfiguration(CUSTOM_CSS_SETTING)) return;
    rewatch();
    listener();
  });
  return {
    dispose: () => {
      watcher?.dispose();
      configSub.dispose();
    },
  };
}
