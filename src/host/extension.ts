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

    // Status-bar item (bottom-right): a fixed color-wheel icon like vscode-pets
    // that opens the scene picker when clicked. It is hidden whenever the
    // scene is disabled.
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.text = '$(symbol-color)';
    statusBarItem.command = 'vscode-scene.selectScene';
    statusBarItem.tooltip = 'VS Code Scene: Select Scene';

    /**
     * Shows or hides the status-bar item based on the `vscode-scene.enabled`
     * setting. The icon itself is always the same (color wheel).
     */
    function updateStatusBar() {
        const enabled = vscode.workspace.getConfiguration('vscode-scene')
            .get<boolean>('enabled', true);

        if (enabled) {
            statusBarItem.show();
        } else {
            statusBarItem.hide();
        }
    }

    // Initial sync + follow changes to the enabled setting.
    updateStatusBar();
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('vscode-scene.enabled')) {
                updateStatusBar();
            }
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

    // Command: let the user pick a scene from a quick-pick list.
    // Selecting an entry updates the `vscode-scene.screen` setting, which
    // ScenePanel.ts already listens to and forwards to the webview — so the
    // scene switches live without any extra plumbing.
    const selectSceneCommand = vscode.commands.registerCommand('vscode-scene.selectScene', async () => {
        // The currently selected scene (used to mark it in the list).
        const current = vscode.workspace.getConfiguration('vscode-scene')
            .get<string>('screen', 'sky-pilot');

        const scenes = [
            { label: 'Sky Pilot', value: 'sky-pilot' },
            { label: 'Aquarium', value: 'aquarium' },
            { label: 'Stars', value: 'stars' },
        ];

        // Show the quick-pick list. The currently active scene is marked
        // with a checkmark so the user always knows which one is running.
        const pick = await vscode.window.showQuickPick(
            scenes.map((s) => ({
                label: (s.value === current ? '$(check) ' : '') + s.label,
                value: s.value,
            })),
            {
                placeHolder: 'Select the scene to display',
            }
        );

        // User pressed Escape (cancel) — nothing to do.
        if (!pick) {
            return;
        }

        // Persist the selection. ScenePanel.ts picks this up automatically
        // via onDidChangeConfiguration and the webview switches live.
        await vscode.workspace.getConfiguration('vscode-scene')
            .update('screen', pick.value, vscode.ConfigurationTarget.Global);

        // Only AFTER the user has picked a scene do we enable the view —
        // a disabled scene is never turned on before the user commits.
        await vscode.workspace.getConfiguration('vscode-scene')
            .update('enabled', true, vscode.ConfigurationTarget.Global);
    });

    // All commands, the status-bar item, and the provider are disposed
    // automatically on deactivation.
    context.subscriptions.push(startCommand, stopCommand, selectSceneCommand, statusBarItem);
}

/**
 * Called once when the extension is deactivated.
 * Nothing special to clean up — all subscriptions are auto-disposed.
 */
export function deactivate() {}
