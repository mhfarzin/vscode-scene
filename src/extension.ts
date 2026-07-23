import * as vscode from 'vscode';
import { ScreensaverViewProvider } from './panel/ScreensaverPanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('VS Code Screensaver is active!');

    // Register the webview view provider in the explorer sidebar
    const provider = new ScreensaverViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('vscode-screensaver.view', provider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    // Register command to show the screensaver
    const startCommand = vscode.commands.registerCommand('vscode-screensaver.start', () => {
        vscode.commands.executeCommand('workbench.view.explorer');
    });

    // Register command to stop the screensaver
    const stopCommand = vscode.commands.registerCommand('vscode-screensaver.stop', () => {
        vscode.commands.executeCommand('workbench.action.closeSidebar');
    });

    context.subscriptions.push(startCommand, stopCommand);
}

export function deactivate() {}
