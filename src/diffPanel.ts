import * as vscode from "vscode";
import * as path from "path";
import { SETTING_KEYS } from "../webview/settings";

const CONFIG_NAMESPACE = "markdownStudio";

function readSettings(): Record<string, unknown> {
  const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
  const out: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    const value = config.get(key);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

async function writeSettings(next: Record<string, unknown>): Promise<void> {
  const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
  for (const key of SETTING_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
    const incoming = next[key];
    if (config.get(key) === incoming) continue;
    await config.update(key, incoming, vscode.ConfigurationTarget.Global);
  }
}

/**
 * Standalone webview panel showing a rich markdown diff between any two
 * URIs (file:, git:, vscode-scm:, anything VSCode's text-document layer can
 * read). Re-uses the same webview bundle as the custom editor but mounts
 * the DiffApp entry instead of the full Tiptap editor.
 */
export class BetterMarkdownDiffPanel {
  private static active: BetterMarkdownDiffPanel | null = null;
  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private disposables: vscode.Disposable[] = [];
  private leftUri: vscode.Uri;
  private rightUri: vscode.Uri;
  private title: string;

  static async createOrShow(
    context: vscode.ExtensionContext,
    leftUri: vscode.Uri,
    rightUri: vscode.Uri,
    title: string,
  ) {
    if (this.active && !this.active.panel.webview) {
      this.active = null;
    }
    if (this.active) {
      // Reuse existing panel — just swap content
      this.active.leftUri = leftUri;
      this.active.rightUri = rightUri;
      this.active.title = title;
      this.active.panel.title = `Diff: ${title}`;
      this.active.panel.reveal(vscode.ViewColumn.Active);
      await this.active.refresh();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "betterMarkdown.diff",
      `Diff: ${title}`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "dist"),
        ],
      },
    );
    this.active = new BetterMarkdownDiffPanel(
      context,
      panel,
      leftUri,
      rightUri,
      title,
    );
    await this.active.refresh();
  }

  private constructor(
    context: vscode.ExtensionContext,
    panel: vscode.WebviewPanel,
    leftUri: vscode.Uri,
    rightUri: vscode.Uri,
    title: string,
  ) {
    this.context = context;
    this.panel = panel;
    this.leftUri = leftUri;
    this.rightUri = rightUri;
    this.title = title;
    this.panel.webview.html = this.getHtml();

    this.disposables.push(
      this.panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.type === "diffReady") {
          await this.postInit();
        } else if (msg.type === "closeDiff") {
          this.panel.dispose();
        } else if (msg.type === "saveSettings") {
          await writeSettings(msg.settings as Record<string, unknown>);
        }
      }),
    );

    // Push settings updates from VS Code config (Settings UI, .vscode/
    // settings.json, the editor's in-app panel) into the diff webview so
    // its in-app settings panel and diff-mode/layout stay in sync.
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration(CONFIG_NAMESPACE)) return;
        this.panel.webview.postMessage({
          type: "settingsUpdated",
          settings: readSettings(),
        });
      }),
    );

    this.disposables.push(
      this.panel.onDidDispose(() => {
        BetterMarkdownDiffPanel.active = null;
        this.dispose();
      }),
    );

    // Refresh when either side changes on disk
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        const uri = doc.uri.toString();
        if (uri === this.leftUri.toString() || uri === this.rightUri.toString()) {
          this.refresh();
        }
      }),
    );
  }

  private async refresh() {
    try {
      const [oldContent, newContent] = await Promise.all([
        this.readUri(this.leftUri),
        this.readUri(this.rightUri),
      ]);
      this.panel.webview.postMessage({
        type: "diffUpdate",
        oldContent,
        newContent,
      });
    } catch (err: any) {
      console.error("[better-markdown] diff refresh failed:", err);
    }
  }

  private async postInit() {
    const settings = readSettings();
    let oldContent = "";
    let newContent = "";
    try {
      oldContent = await this.readUri(this.leftUri);
    } catch {
      // File didn't exist at ref → empty
    }
    try {
      newContent = await this.readUri(this.rightUri);
    } catch {
      // File didn't exist at ref → empty
    }
    this.panel.webview.postMessage({
      type: "diffInit",
      oldContent,
      newContent,
      fileName: path.basename(this.rightUri.fsPath || this.leftUri.fsPath),
      title: this.title,
      settings,
    });
  }

  private async readUri(uri: vscode.Uri): Promise<string> {
    const doc = await vscode.workspace.openTextDocument(uri);
    return doc.getText();
  }

  private getHtml(): string {
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.js"),
    );
    const styleUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "editor.css"),
    );
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'wasm-unsafe-eval'; font-src ${this.panel.webview.cspSource} data:; img-src ${this.panel.webview.cspSource} data: blob: https:;`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link href="${styleUri}" rel="stylesheet">
  <title>Markdown Studio — Diff</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">window.__BTRMK_MODE__ = "diff";</script>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}

function getNonce(): string {
  let text = "";
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
