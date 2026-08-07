/**
 * serve-test.mjs
 * ---------------------------------------------------------------------------
 * Standalone static server for the scene TEST page only.
 *
 * This script is intentionally SEPARATE from the extension itself:
 *   - It does NOT touch any code under src/host or src/webview
 *   - It only serves the built bundle (dist/) + assets/ + test.html
 *
 * Usage:
 *   npm run serve:test          → starts server, then opens the browser
 *   npm run serve:test -- --no-open
 *
 * URL:
 *   http://localhost:4173/test.html?screen=stars        (Stars screen)
 *   http://localhost:4173/test.html?screen=sky-pilot    (SkyPilot screen)
 *
 * Why a server at all?
 *   The extension's webview normally gets its resources via VS Code's
 *   asWebviewUri() (vscode-webview://...). A plain file:// URL blocks some
 *   fetches in Chrome, so serving over http:// behaves much closer to the
 *   real webview environment.
 * ---------------------------------------------------------------------------
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PORT = 4173;
const HOST = '127.0.0.1';

/** Maps file extensions to Content-Type headers. */
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.map': 'application/json; charset=utf-8',
};

/** Serves a file from disk, resolving path traversal safely. */
async function serveFile(res, filePath) {
    const normalized = path.normalize(filePath);
    if (!normalized.startsWith(ROOT)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('403 Forbidden');
        return;
    }

    try {
        const data = await readFile(normalized);
        const ext = path.extname(normalized).toLowerCase();
        res.writeHead(200, {
            'Content-Type': MIME[ext] ?? 'application/octet-stream',
            'Cache-Control': 'no-store',
        });
        res.end(data);
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
    }
}

const server = createServer((req, res) => {
    let urlPath;
    try {
        urlPath = new URL(req.url, `http://${HOST}:${PORT}`).pathname;
    } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('400 Bad Request');
        return;
    }

    // Map "/" to test.html for convenience.
    if (urlPath === '/' || urlPath === '/index.html') {
        urlPath = '/test.html';
    }

    // Strip a leading "/" and join with the project root.
    const relative = urlPath.replace(/^\/+/, '');
    const filePath = path.join(ROOT, relative);

    serveFile(res, filePath);
});

server.listen(PORT, HOST, () => {
    const starsUrl = `http://${HOST}:${PORT}/test.html?screen=stars`;
    const skyUrl = `http://${HOST}:${PORT}/test.html?screen=sky-pilot`;
    console.log('');
    console.log('  ════════════════════════════════════════════════════════');
    console.log('   VS Code Scene — Standalone Test Server');
    console.log('  ════════════════════════════════════════════════════════');
    console.log(`   Stars    → ${starsUrl}`);
    console.log(`   SkyPilot → ${skyUrl}`);
    console.log('');
    console.log('   Press Ctrl+C to stop the server.');
    console.log('  ════════════════════════════════════════════════════════');
    console.log('');

    // Auto-open the stars test page unless --no-open is passed.
    if (!process.argv.includes('--no-open')) {
        const url = starsUrl;
        if (process.platform === 'win32') {
            spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
        } else if (process.platform === 'darwin') {
            spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
        } else {
            spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
        }
    }
});
