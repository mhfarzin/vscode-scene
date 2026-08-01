/**
 * ScreensaverPanel.ts
 * ---------------------------------------------------------------------------
 * WebviewViewProvider for the screensaver's Explorer-sidebar view.
 *
 * Responsibilities:
 *   - Provides the HTML shell (a full-viewport <canvas>)
 *   - Injects `window.__ASSETS_BASE_URI__` so each screen can build
 *     absolute webview URLs for its own assets
 *   - Reads the `vscode-screensaver.screen` setting and injects it into the
 *     webview via `window.__SCREEN_TYPE__`
 *   - Listens for setting changes and notifies the webview so the active
 *     screen switches live without reloading the view
 *   - Loads the compiled `panel.js` client script
 *
 * IMPORTANT: This file must stay screen-agnostic. Do NOT add screen-specific
 * logic or asset URIs here — every screen manages its own assets via
 * `__ASSETS_BASE_URI__` + relative path.
 *
 * This file runs in the extension host (Node.js).
 * ---------------------------------------------------------------------------
 */

import * as vscode from "vscode";

/** The screen types selectable in the `vscode-screensaver.screen` setting. */
const VALID_SCREEN_TYPES = ['stars', 'sky-pilot'];

/** Default screen used when the setting is missing or invalid. */
const DEFAULT_SCREEN_TYPE = 'sky-pilot';

/**
 * Provides the webview view for the screensaver.
 */
export class ScreensaverViewProvider implements vscode.WebviewViewProvider {
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
        //   and `assets/` (images used by screens)
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, "dist"),
                vscode.Uri.joinPath(this._extensionUri, "assets"),
            ],
        };

        // Listen for changes to the selected screen setting and push the new
        // value to the webview so it can switch screens live.
        this._settingsListener = vscode.workspace.onDidChangeConfiguration((e) => {
            if (!e.affectsConfiguration('vscode-screensaver.screen')) {
                return;
            }
            this._postScreenType();
        });
        webviewView.onDidDispose(() => {
            this._settingsListener?.dispose();
            this._settingsListener = undefined;
        });

        // Inject the HTML shell.
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Push the initial screen type (the latest setting value).
        this._postScreenType();
    }

    /** Cleans up the view when the webview is closed. */
    public dispose() {
        // Dispose of the view if needed
    }

    /**
     * Reads the `vscode-screensaver.screen` setting and posts the selected
     * screen type string to the webview.
     *
     * The client uses this value to create the active screen (initial) and
     * to switch screens live when the setting changes.
     */
    private _postScreenType() {
        if (!this._view) {
            return;
        }

        const screenType = this._getScreenType();

        void this._view.webview.postMessage({
            type: 'screenType',
            value: screenType,
        });
    }

    /**
     * Reads and validates the `vscode-screensaver.screen` setting.
     *
     * @returns the selected screen type, or the default when missing/invalid
     */
    private _getScreenType(): string {
        const config = vscode.workspace.getConfiguration('vscode-screensaver');
        const screenType = config.get<string>('screen', DEFAULT_SCREEN_TYPE);
        return VALID_SCREEN_TYPES.includes(screenType) ? screenType : DEFAULT_SCREEN_TYPE;
    }

    /**
     * Builds the HTML document for the webview.
     *
     * Contains:
     *   - A full-viewport <canvas id="canvas"> for the screens
     *   - An inline script that sets `window.__ASSETS_BASE_URI__`
     *     to the webview URI of the extension's `assets/` folder
     *   - An inline script that sets `window.__SCREEN_TYPE__` to the
     *     user's selected screen type from the settings
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

        // URI of the assets folder — exposed to screens as a global.
        const assetsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "assets"),
        );

        // Current screen type from the user setting — exposed to the client
        // as a global so panel.ts can pick the right screen at startup.
        const safeType = this._getScreenType();

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>VS Code Screensaver</title>
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
            <!-- 1) Expose assets folder URI + selected screen type -->
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
