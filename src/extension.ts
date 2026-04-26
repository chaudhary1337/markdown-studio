import * as vscode from "vscode";
import * as path from "path";
import { spawn, ChildProcess } from "child_process";
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

  // Setup prompt — re-runs the first-run consent dialog so users can
  // review or change normalization handling at any time.
  context.subscriptions.push(
    vscode.commands.registerCommand("betterMarkdown.openSetupPrompt", () => {
      provider.showFirstRunConsent();
    })
  );

  // Reset setup state — clears the first-run consent flag so the
  // on-open welcome modal fires again on the next markdown file open.
  context.subscriptions.push(
    vscode.commands.registerCommand("betterMarkdown.resetSetupState", () => {
      void provider.resetSetupState();
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

  // Open in Browser — spawns a single long-lived server, then opens
  // the file-specific URL. The server handles multiple files.
  let serverProcess: ChildProcess | null = null;

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "betterMarkdown.openInBrowser",
      async (uri?: vscode.Uri) => {
        // The active editor when the rich (custom) editor is focused is
        // a CustomEditor, so `vscode.window.activeTextEditor` is undefined.
        // Fall back to the active tab's input URI, then the active text
        // editor as a last resort.
        const activeTabInput =
          vscode.window.tabGroups.activeTabGroup.activeTab?.input;
        const tabUri =
          activeTabInput &&
          typeof activeTabInput === "object" &&
          "uri" in activeTabInput
            ? ((activeTabInput as { uri: vscode.Uri }).uri)
            : undefined;
        const fileUri =
          uri ||
          tabUri ||
          vscode.window.activeTextEditor?.document.uri;
        if (!fileUri || fileUri.scheme !== "file") {
          vscode.window.showWarningMessage(
            "Markdown Studio: no markdown file to open in browser."
          );
          return;
        }
        const filePath = fileUri.fsPath;

        // Start server if not running
        if (!serverProcess) {
          const serverScript = path.join(
            context.extensionPath,
            "dist",
            "server.js"
          );
          serverProcess = spawn("node", [serverScript], {
            cwd: context.extensionPath,
            stdio: "ignore",
            detached: false,
          });
          serverProcess.on("exit", () => { serverProcess = null; });
          // Give it a moment to start
          await new Promise((r) => setTimeout(r, 1500));
        }

        vscode.env.openExternal(
          vscode.Uri.parse(`http://localhost:3333/edit${filePath}`)
        );
      }
    )
  );

  // Clean up server on deactivation
  context.subscriptions.push({
    dispose() {
      if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
      }
    },
  });

  // Close non-file custom editor tabs (git:, scm: schemes).  When VS Code
  // opens a diff for a .md file, the custom editor intercepts both sides and
  // spawns read-only panes with git:/scm: URIs.  These render in the rich
  // editor but can't be edited, so we auto-close them.
  //
  // NOTE: we investigated replacing these with the rich diff panel
  // (BetterMarkdownDiffPanel) for Claude Code integration, but Claude Code
  // writes to disk only AFTER the user accepts in the CLI — before that the
  // proposed content is internal to Claude Code with no extension API to
  // read it.  onDidChangeTextDocument fires post-acceptance (too late for
  // review) and onDidChangeTabs sees only a TabInputCustom, not a
  // TabInputTextDiff.  Pre-acceptance rich diff requires Claude Code to
  // expose proposed content to extensions.
  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs((e) => {
      for (const tab of e.opened) {
        const input = tab.input;
        if (
          input instanceof vscode.TabInputCustom &&
          input.viewType === CUSTOM_EDITOR_VIEW_TYPE &&
          input.uri.scheme !== "file"
        ) {
          setTimeout(async () => {
            try { await vscode.window.tabGroups.close(tab); } catch {}
          }, 50);
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
      new vscode.CodeLens(range, {
        title: "Open in Browser",
        command: "betterMarkdown.openInBrowser",
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
