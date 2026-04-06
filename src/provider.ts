import * as vscode from "vscode";
import * as path from "path";

const SETTINGS_KEY = "betterMarkdown.settings";

export class BetterMarkdownProvider implements vscode.CustomTextEditorProvider {
  constructor(readonly context: vscode.ExtensionContext) {}

  private activeWebview: vscode.Webview | null = null;
  private openWebviews = new Set<vscode.Webview>();

  openSearch() {
    this.activeWebview?.postMessage({ type: "openSearch" });
  }

  private loadSettings(): Record<string, unknown> {
    return this.context.globalState.get<Record<string, unknown>>(SETTINGS_KEY, {}) ?? {};
  }

  private async saveSettings(next: Record<string, unknown>) {
    await this.context.globalState.update(SETTINGS_KEY, next);
    // Echo updated settings to every open panel so they stay in sync
    for (const wv of this.openWebviews) {
      wv.postMessage({ type: "settingsUpdated", settings: next });
    }
  }

  /**
   * Fetch the HEAD version of a file via VSCode's built-in git extension.
   * Returns null if git isn't available, the file isn't tracked, or the ref
   * doesn't exist (e.g. new file).
   */
  private async getHeadContent(fileUri: vscode.Uri): Promise<string | null> {
    try {
      const gitExt = vscode.extensions.getExtension("vscode.git");
      if (!gitExt) return null;
      if (!gitExt.isActive) await gitExt.activate();
      // The git extension API is un-typed in @types/vscode — loose typing.
      const gitApi = (gitExt.exports as any).getAPI(1);
      if (!gitApi) return null;
      const repo = gitApi.repositories.find((r: any) =>
        fileUri.fsPath.startsWith(r.rootUri.fsPath)
      );
      if (!repo) return null;
      // Empty ref ('') = staged, 'HEAD' = committed. We want HEAD.
      const head = await repo.show("HEAD", fileUri.fsPath);
      return typeof head === "string" ? head : null;
    } catch {
      return null;
    }
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // Non-file schemes (git:, conflictResolution:, vscode-scm:, ...) should
    // open in VS Code's built-in text editor so native git diffs work
    // normally. Dispose the custom-editor panel and reopen with the default
    // text editor.
    if (document.uri.scheme !== "file") {
      webviewPanel.dispose();
      vscode.commands.executeCommand("vscode.openWith", document.uri, "default");
      return;
    }

    const webview = webviewPanel.webview;

    // Allow loading resources from the document's folder (for images)
    const docFolder = vscode.Uri.joinPath(document.uri, "..");
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "dist"),
        docFolder,
        ...(vscode.workspace.workspaceFolders?.map((f) => f.uri) || []),
      ],
    };

    // Base URI for resolving relative image paths in webview
    const baseUri = webview.asWebviewUri(docFolder).toString();
    // Raw filesystem path of the document's folder (for restoring relative paths on save)
    const docFolderPath = docFolder.fsPath;

    let pendingWebviewEdits = 0;

    this.openWebviews.add(webview);

    const msgDisposable = webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "ready") {
        webview.postMessage({
          type: "init",
          content: document.getText(),
          baseUri,
          docFolderPath,
          settings: this.loadSettings(),
        });
      } else if (msg.type === "saveSettings") {
        await this.saveSettings(msg.settings as Record<string, unknown>);
      } else if (msg.type === "requestGitDiff") {
        const headContent = await this.getHeadContent(document.uri);
        webview.postMessage({
          type: "gitDiffResponse",
          headContent,
          fileName: path.basename(document.uri.fsPath),
        });
      } else if (msg.type === "toggleEditor") {
        vscode.commands.executeCommand(
          "vscode.openWith",
          document.uri,
          "default"
        );
      } else if (msg.type === "openLink") {
        const href = msg.href as string;
        if (href.startsWith("http://") || href.startsWith("https://")) {
          vscode.env.openExternal(vscode.Uri.parse(href));
        } else {
          // Relative link — resolve against the document's folder
          const docDir = path.dirname(document.uri.fsPath);
          const targetPath = path.resolve(docDir, href);
          const targetUri = vscode.Uri.file(targetPath);
          try {
            await vscode.commands.executeCommand("vscode.open", targetUri);
          } catch {
            // If file doesn't exist, ignore
          }
        }
      } else if (msg.type === "edit") {
        const newContent = msg.content as string;
        if (newContent === document.getText()) return;
        pendingWebviewEdits++;
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
          document.uri,
          new vscode.Range(0, 0, document.lineCount, 0),
          newContent
        );
        await vscode.workspace.applyEdit(edit);
      }
    });

    webview.html = this.getHtmlForWebview(webview);

    // Track active webview for search command
    if (webviewPanel.active) this.activeWebview = webview;
    webviewPanel.onDidChangeViewState(() => {
      if (webviewPanel.active) this.activeWebview = webview;
    });

    const docChangeDisposable = vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document.uri.toString() !== document.uri.toString()) return;
        if (e.contentChanges.length === 0) return;
        // Only send updates when this editor panel is visible/active
        if (!webviewPanel.visible) return;

        if (pendingWebviewEdits > 0) {
          pendingWebviewEdits--;
          return;
        }

        webview.postMessage({
          type: "update",
          content: document.getText(),
        });
      }
    );

    webviewPanel.onDidDispose(() => {
      msgDisposable.dispose();
      docChangeDisposable.dispose();
      this.openWebviews.delete(webview);
    });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "editor.css")
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'wasm-unsafe-eval'; font-src ${webview.cspSource} data:; img-src ${webview.cspSource} data: blob: https:;">
  <link href="${styleUri}" rel="stylesheet">
  <title>Better Markdown</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
