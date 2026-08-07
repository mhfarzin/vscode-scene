/**
 * extension.ts
 * ---------------------------------------------------------------------------
 * Entry point for the vscode-scene extension.
 *
 * Responsibilities:
 *   - Registers the WebviewViewProvider that renders the scene
 *     in the Explorer sidebar
 *   - Registers `vscode-scene.start` / `vscode-scene.stop`
 *     commands that show/hide the sidebar
 *
 * This file runs in the extension host (Node.js). All scene
 * rendering lives client-side in `src/webview/`.
 * ---------------------------------------------------------------------------
 */

import * as vscode from 'vscode';
import { SceneViewProvider } from './ScenePanel';

/**
 * Called once when the extension is activated.
 * Registers the webview provider and commands.
 *
 * @param context - extension context (subscriptions, workspace state, etc.)
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('VS Code Scene is active!');

    // Register the webview view provider in the explorer sidebar.
    // `retainContextWhenHidden` keeps the animation running when
    // the sidebar is collapsed/restored.
    const provider = new SceneViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('vscode-scene.view', provider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    // Command: enable the scene permanently and show it in the Explorer.
    const startCommand = vscode.commands.registerCommand('vscode-scene.start', async () => {
        await vscode.workspace.getConfiguration('vscode-scene')
            .update('enabled', true, vscode.ConfigurationTarget.Global);
        await vscode.commands.executeCommand('workbench.view.explorer');
    });

    // Command: disable the scene permanently (view disappears from Explorer).
    const stopCommand = vscode.commands.registerCommand('vscode-scene.stop', async () => {
        await vscode.workspace.getConfiguration('vscode-scene')
            .update('enabled', false, vscode.ConfigurationTarget.Global);
    });

    // Both commands + the provider are disposed automatically on deactivation.
    context.subscriptions.push(startCommand, stopCommand);
}

/**
 * Called once when the extension is deactivated.
 * Nothing special to clean up — all subscriptions are auto-disposed.
 */
export function deactivate() {}
