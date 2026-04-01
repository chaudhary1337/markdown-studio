import * as vscode from "vscode";
import { BetterMarkdownProvider } from "./provider";

const CUSTOM_EDITOR_VIEW_TYPE = "betterMarkdown.editor";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(BetterMarkdownProvider.register(context));

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
