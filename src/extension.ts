import * as vscode from "vscode";
import * as path from "path";
import { BetterMarkdownProvider } from "./provider";
import { BetterMarkdownDiffPanel } from "./diffPanel";

const CUSTOM_EDITOR_VIEW_TYPE = "betterMarkdown.editor";

export function activate(context: vscode.ExtensionContext) {
  const provider = new BetterMarkdownProvider(context);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      CUSTOM_EDITOR_VIEW_TYPE,
      provider,
      {
        supportsMultipleEditorsPerDocument: true,
        webviewOptions: { retainContextWhenHidden: true },
      }
    )
  );

  // Toggle command
  context.subscriptions.push(
    vscode.commands.registerCommand("betterMarkdown.toggleEditor", async () => {
      const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
      if (!activeTab) return;

      const input = activeTab.input;
      if (!input || typeof input !== "object") return;

      const isCustomEditor =
        "viewType" in input &&
        (input as any).viewType === CUSTOM_EDITOR_VIEW_TYPE;

      const uri = (input as any).uri as vscode.Uri | undefined;
      if (!uri) return;

      if (isCustomEditor) {
        await vscode.commands.executeCommand("vscode.openWith", uri, "default");
      } else {
        await vscode.commands.executeCommand("vscode.openWith", uri, CUSTOM_EDITOR_VIEW_TYPE);
      }
    })
  );

  // Find command — sends message to active webview
  context.subscriptions.push(
    vscode.commands.registerCommand("betterMarkdown.find", () => {
      provider.openSearch();
    })
  );

  // Rich diff — opens a dedicated webview panel comparing any two URIs.
  // Invoked from command palette, SCM context menu, or diff-editor toolbar.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "betterMarkdown.openDiff",
      async (arg?: unknown, second?: unknown) => {
        const { leftUri, rightUri, title } = await resolveDiffArgs(arg, second);
        if (!leftUri || !rightUri) {
          vscode.window.showInformationMessage(
            "Better Markdown: no markdown file to diff."
          );
          return;
        }
        await BetterMarkdownDiffPanel.createOrShow(
          context,
          leftUri,
          rightUri,
          title
        );
      }
    )
  );

  // Debug: log opened tab types to Output channel so we can see what
  // Claude Code actually creates, then close unwanted markdown diff tabs.
  const log = vscode.window.createOutputChannel("Better Markdown");
  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs(async (e) => {
      for (const tab of e.opened) {
        const input = tab.input as any;
        log.appendLine(
          `[tab opened] label=${JSON.stringify(tab.label)} ` +
          `constructorName=${input?.constructor?.name} ` +
          `viewType=${input?.viewType} ` +
          `scheme=${input?.uri?.scheme ?? input?.modified?.scheme} ` +
          `path=${input?.uri?.path ?? input?.modified?.path}`
        );

        // Text diff tabs for .md files
        if (input?.modified && input?.original) {
          const filePath: string = input.modified.fsPath || input.modified.path || "";
          if (filePath.toLowerCase().endsWith(".md")) {
            log.appendLine("  → closing text diff tab");
            await vscode.window.tabGroups.close(tab);
            continue;
          }
        }

        // Custom editor tabs for non-file schemes (git:, etc.)
        if (
          input?.viewType === CUSTOM_EDITOR_VIEW_TYPE &&
          input?.uri?.scheme &&
          input.uri.scheme !== "file"
        ) {
          log.appendLine("  → closing non-file custom editor tab");
          await vscode.window.tabGroups.close(tab);
        }
      }
    })
  );

  // CodeLens: "Open in Rich Editor" above line 1 in source mode
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: "markdown" },
      new RichEditorCodeLensProvider()
    )
  );
}

class RichEditorCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const range = new vscode.Range(0, 0, 0, 0);
    return [
      new vscode.CodeLens(range, {
        title: "Open in Rich Editor",
        command: "betterMarkdown.toggleEditor",
      }),
    ];
  }
}

export function deactivate() {}

/**
 * Figure out which two URIs to diff from whatever the caller passed us.
 * Supports:
 *   - SCM resource state (right-click in Source Control panel)
 *   - Two URIs (explicit)
 *   - One URI (compared vs HEAD)
 *   - No args: try active diff editor, else active text editor vs HEAD
 */
async function resolveDiffArgs(
  arg: unknown,
  second: unknown
): Promise<{
  leftUri: vscode.Uri | undefined;
  rightUri: vscode.Uri | undefined;
  title: string;
}> {
  // Case: two URI args
  if (arg instanceof vscode.Uri && second instanceof vscode.Uri) {
    return {
      leftUri: arg,
      rightUri: second,
      title: path.basename(second.fsPath || second.path),
    };
  }

  // Case: single URI arg → diff vs HEAD
  if (arg instanceof vscode.Uri) {
    return withHead(arg);
  }

  // Case: SCM resource state (shape: { resourceUri: Uri, ... })
  if (arg && typeof arg === "object" && "resourceUri" in arg) {
    const resourceUri = (arg as { resourceUri: vscode.Uri }).resourceUri;
    if (resourceUri instanceof vscode.Uri) return withHead(resourceUri);
  }

  // No args: look at active tab for a diff editor, else active text editor
  const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (activeTab && activeTab instanceof vscode.TabInputTextDiff) {
    return {
      leftUri: activeTab.original,
      rightUri: activeTab.modified,
      title: path.basename(
        activeTab.modified.fsPath || activeTab.modified.path
      ),
    };
  }

  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) return withHead(activeEditor.document.uri);

  return { leftUri: undefined, rightUri: undefined, title: "" };
}

function withHead(fileUri: vscode.Uri) {
  // git: URI pointing to HEAD version of the file.
  const gitUri = vscode.Uri.from({
    scheme: "git",
    path: fileUri.path,
    query: JSON.stringify({
      path: fileUri.fsPath,
      ref: "HEAD",
    }),
  });
  return {
    leftUri: gitUri,
    rightUri: fileUri,
    title: `${path.basename(fileUri.fsPath)} · HEAD ↔ working`,
  };
}
