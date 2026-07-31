/**
 * panel.ts
 * ---------------------------------------------------------------------------
 * Client-side script running inside the webview.
 *
 * Responsibilities:
 *   - Finds the <canvas> element provided by ScreensaverPanel.ts's HTML
 *   - Sizes the canvas to fill the webview
 *   - Instantiates the active screen via the ScreenFactory
 *   - Starts the screen's animation loop
 *   - Handles window resizing by forwarding new dimensions to the screen
 *
 * NOTE: `window.__ASSETS_BASE_URI__` is injected by ScreensaverPanel.ts
 * and is used by individual screens to build asset URLs.
 * ---------------------------------------------------------------------------
 */

// VS Code Screensaver - Panel script
/// <reference lib="dom" />

import { ScreenType } from './screens/ScreenType';
import { ScreenConfig, BaseScreen } from './screens/BaseScreen';
import { createScreen } from './screens/ScreenFactory';

/** The currently active screen instance (null when none is running). */
let currentScreen: BaseScreen | null = null;

/**
 * Sizes the canvas to fill the webview and forwards the new
 * dimensions to the active screen so it can re-layout its content.
 *
 * @param canvas - the <canvas> element to resize
 */
function resizeCanvas(canvas: HTMLCanvasElement) {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Set both the backing store size and the CSS display size.
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    // Let the active screen adapt to the new size.
    if (currentScreen) {
        currentScreen.resize(w, h);
    }
}

/**
 * Disposes the current screen (if any) and creates + starts a new one.
 *
 * @param canvas - the <canvas> element to render onto
 */
function createOrSwitchScreen(canvas: HTMLCanvasElement) {
    // Dispose the old screen first to stop its loop and free resources.
    if (currentScreen) {
        currentScreen.dispose();
        currentScreen = null;
    }

    // Clear the canvas before starting a new screen.
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Currently we hardcode SkyPilot. Future work could make this
    // user-configurable (command palette, settings, etc.).
    const config: ScreenConfig = {
        type: ScreenType.SkyPilot,
    };

    // Create and start the screen.
    const screen = createScreen(canvas, config);
    currentScreen = screen;

    // `start()` may return a Promise (async screens). Handle errors if so.
    const result = screen.start();
    if (result instanceof Promise) {
        result.catch((err) => console.error('[Screensaver] Screen start error:', err));
    }
}

/**
 * Bootstraps the panel once the DOM is ready:
 * sizes the canvas, creates the screen, and listens for window resizes.
 */
async function main() {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas) return;

    resizeCanvas(canvas);
    createOrSwitchScreen(canvas);

    window.addEventListener('resize', () => resizeCanvas(canvas));
}

// Wait for the DOM to be ready before bootstrapping.
document.addEventListener('DOMContentLoaded', main);
