/**
 * ScreensaverPanel.ts
 * ---------------------------------------------------------------------------
 * WebviewViewProvider for the screensaver's Explorer-sidebar view.
 *
 * Responsibilities:
 *   - Provides the HTML shell (a full-viewport <canvas>)
 *   - Injects `window.__ASSETS_BASE_URI__` so each screen can build
 *     absolute webview URLs for its own assets
 *   - Loads the compiled `panel.js` client script
 *
 * IMPORTANT: This file must stay screen-agnostic. Do NOT add screen-specific
 * logic or asset URIs here — every screen manages its own assets via
 * `__ASSETS_BASE_URI__` + relative path.
 * ---------------------------------------------------------------------------
 */

import * as vscode from "vscode";

/**
 * Provides the webview view for the screensaver.
 */
export class ScreensaverViewProvider implements vscode.WebviewViewProvider {
    /** Reference to the currently active webview view. */
    private _view?: vscode.WebviewView;

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

        // Inject the HTML shell.
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    }

    /** Cleans up the view when the webview is closed. */
    public dispose() {
        // Dispose of the view if needed
    }

    /**
     * Builds the HTML document for the webview.
     *
     * Contains:
     *   - A full-viewport <canvas id="canvas"> for the screens
     *   - An inline script that sets `window.__ASSETS_BASE_URI__`
     *     to the webview URI of the extension's `assets/` folder
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
            <!-- 1) Expose assets folder URI to all screens -->
            <script>
                window.__ASSETS_BASE_URI__ = "${assetsUri}";
            </script>
            <!-- 2) Load the client-side panel script -->
            <script src="${scriptUri}"></script>
        </body>
        </html>`;
    }
}
