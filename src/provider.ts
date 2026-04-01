import * as vscode from "vscode";
import * as path from "path";

export class BetterMarkdownProvider implements vscode.CustomTextEditorProvider {
  private static readonly viewType = "betterMarkdown.editor";

  constructor(private readonly context: vscode.ExtensionContext) {}

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      BetterMarkdownProvider.viewType,
      new BetterMarkdownProvider(context),
      {
        supportsMultipleEditorsPerDocument: true,
        webviewOptions: { retainContextWhenHidden: true },
      }
    );
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
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

    const msgDisposable = webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "ready") {
        webview.postMessage({
          type: "init",
          content: document.getText(),
          baseUri,
          docFolderPath,
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
    });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "editor.css")
    );
    const webviewStyleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.css")
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'wasm-unsafe-eval'; font-src ${webview.cspSource} data:; img-src ${webview.cspSource} data: blob: https:;">
  <link href="${webviewStyleUri}" rel="stylesheet">
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
