/**
 * ScenePanel.ts
 * ---------------------------------------------------------------------------
 * WebviewViewProvider for the scene's Explorer-sidebar view.
 *
 * Responsibilities:
 *   - Provides the HTML shell (a full-viewport <canvas>)
 *   - Injects `window.__ASSETS_BASE_URI__` so each scene can build
 *     absolute webview URLs for its own assets
 *   - Reads the `vscode-scene.screen` setting and injects it into the
 *     webview via `window.__SCREEN_TYPE__`
 *   - Listens for setting changes and notifies the webview so the active
 *     scene switches live without reloading the view
 *   - Loads the compiled `panel.js` client script
 *
 * IMPORTANT: This file must stay scene-agnostic. Do NOT add scene-specific
 * logic or asset URIs here — every scene manages its own assets via
 * `__ASSETS_BASE_URI__` + relative path.
 *
 * This file runs in the extension host (Node.js).
 * ---------------------------------------------------------------------------
 */

import * as vscode from "vscode";

/** The scene types selectable in the `vscode-scene.screen` setting. */
const VALID_SCENE_TYPES = ['stars', 'sky-pilot'];

/** Default scene used when the setting is missing or invalid. */
const DEFAULT_SCENE_TYPE = 'sky-pilot';

/**
 * Provides the webview view for the scene.
 */
export class SceneViewProvider implements vscode.WebviewViewProvider {
    /** Reference to the currently active webview view. */
    private _view?: vscode.WebviewView;

    /** Disposable for the settings-change listener. */
    private _settingsListener?: vscode.Disposable;

    /** Root URI of the extension directory. */
    private _extensionUri: vscode.Uri;

    constructor(extensionUri: vscode.Uri) {
        this._extensionUri = extensionUri;
    }

    /**
     * Called by VS Code when the webview view is created/restored.
     * Sets up webview permissions and injects the HTML shell.
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        // Webview security & resource settings:
        // - enableScripts: the client script needs JS to run
        // - localResourceRoots: allow serving from `dist/` (bundle)
        //   and `assets/` (images used by scenes)
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, "dist"),
                vscode.Uri.joinPath(this._extensionUri, "assets"),
            ],
        };

        // Listen for changes to the selected scene setting and push the new
        // value to the webview so it can switch scenes live.
        this._settingsListener = vscode.workspace.onDidChangeConfiguration((e) => {
            if (!e.affectsConfiguration('vscode-scene.screen')) {
                return;
            }
            this._postSceneType();
        });
        webviewView.onDidDispose(() => {
            this._settingsListener?.dispose();
            this._settingsListener = undefined;
        });

        // Inject the HTML shell.
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Push the initial scene type (the latest setting value).
        this._postSceneType();
    }

    /** Cleans up the view when the webview is closed. */
    public dispose() {
        // Dispose of the view if needed
    }

    /**
     * Reads the `vscode-scene.screen` setting and posts the selected
     * scene type string to the webview.
     *
     * The client uses this value to create the active scene (initial) and
     * to switch scenes live when the setting changes.
     */
    private _postSceneType() {
        if (!this._view) {
            return;
        }

        const sceneType = this._getSceneType();

        void this._view.webview.postMessage({
            type: 'screenType',
            value: sceneType,
        });
    }

    /**
     * Reads and validates the `vscode-scene.screen` setting.
     *
     * @returns the selected scene type, or the default when missing/invalid
     */
    private _getSceneType(): string {
        const config = vscode.workspace.getConfiguration('vscode-scene');
        const sceneType = config.get<string>('screen', DEFAULT_SCENE_TYPE);
        return VALID_SCENE_TYPES.includes(sceneType) ? sceneType : DEFAULT_SCENE_TYPE;
    }

    /**
     * Builds the HTML document for the webview.
     *
     * Contains:
     *   - A full-viewport <canvas id="canvas"> for the scenes
     *   - An inline script that sets `window.__ASSETS_BASE_URI__`
     *     to the webview URI of the extension's `assets/` folder
     *   - An inline script that sets `window.__SCREEN_TYPE__` to the
     *     user's selected scene type from the settings
     *   - A script tag loading the compiled `panel.js` bundle
     *
     * @param webview - the webview whose URIs are used in the HTML
     * @returns the complete HTML string
     */
    private _getHtmlForWebview(webview: vscode.Webview) {
        // URI of the compiled client bundle.
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "dist", "panel.js"),
        );

        // URI of the assets folder — exposed to scenes as a global.
        const assetsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "assets"),
        );

        // Current scene type from the user setting — exposed to the client
        // as a global so panel.ts can pick the right scene at startup.
        const safeType = this._getSceneType();

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>VS Code Scene</title>
            <style>
                html, body {
                    margin: 0;
                    padding: 0;
                    overflow: hidden;
                    background: #000;
                    width: 100%;
                    height: 100%;
                }
                .container {
                    width: 100%;
                    height: 100%;
                }
                #canvas {
                    width: 100%;
                    height: 100%;
                    display: block;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <canvas id="canvas"></canvas>
            </div>
            <!-- 1) Expose assets folder URI + selected scene type -->
            <script>
                window.__ASSETS_BASE_URI__ = "${assetsUri}";
                window.__SCREEN_TYPE__ = "${safeType}";
            </script>
            <!-- 2) Load the client-side panel script -->
            <script src="${scriptUri}"></script>
        </body>
        </html>`;
    }
}
