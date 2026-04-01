import * as vscode from "vscode";
import { BetterMarkdownProvider } from "./provider";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(BetterMarkdownProvider.register(context));
}

export function deactivate() {}
