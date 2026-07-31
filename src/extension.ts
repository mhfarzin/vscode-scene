/**
 * extension.ts
 * ---------------------------------------------------------------------------
 * Entry point for the vscode-screensaver extension.
 *
 * Responsibilities:
 *   - Registers the WebviewViewProvider that renders the screensaver
 *     in the Explorer sidebar
 *   - Registers `vscode-screensaver.start` / `vscode-screensaver.stop`
 *     commands that show/hide the sidebar
 *
 * The heavy lifting (rendering, screen switching, animation) happens
 * client-side in `src/panel/panel.ts` and the screen classes.
 * ---------------------------------------------------------------------------
 */

import * as vscode from 'vscode';
import { ScreensaverViewProvider } from './panel/ScreensaverPanel';

/**
 * Called once when the extension is activated.
 * Registers the webview provider and commands.
 *
 * @param context - extension context (subscriptions, workspace state, etc.)
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('VS Code Screensaver is active!');

    // Register the webview view provider in the explorer sidebar.
    // `retainContextWhenHidden` keeps the animation running when
    // the sidebar is collapsed/restored.
    const provider = new ScreensaverViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('vscode-screensaver.view', provider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    // Command: show the screensaver by opening the Explorer.
    const startCommand = vscode.commands.registerCommand('vscode-screensaver.start', () => {
        vscode.commands.executeCommand('workbench.view.explorer');
    });

    // Command: stop the screensaver by closing the sidebar.
    const stopCommand = vscode.commands.registerCommand('vscode-screensaver.stop', () => {
        vscode.commands.executeCommand('workbench.action.closeSidebar');
    });

    // Both commands + the provider are disposed automatically on deactivation.
    context.subscriptions.push(startCommand, stopCommand);
}

/**
 * Called once when the extension is deactivated.
 * Nothing special to clean up — all subscriptions are auto-disposed.
 */
export function deactivate() {}
