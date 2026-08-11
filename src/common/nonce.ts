/**
 * nonce.ts
 * ---------------------------------------------------------------------------
 * Shared helpers for webview Content-Security-Policy (CSP).
 *
 * Framework-agnostic: no `vscode` import and no DOM access, so it can be
 * used from both the extension host and the webview sandbox.
 * ---------------------------------------------------------------------------
 */

/**
 * Generates a random 32-character nonce used to whitelist inline scripts
 * and styles in the webview HTML under the Content-Security-Policy.
 */
export function getNonce(): string {
    let text = '';
    const possible =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
