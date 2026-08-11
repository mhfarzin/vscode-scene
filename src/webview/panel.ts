/**
 * panel.ts
 * ---------------------------------------------------------------------------
 * Client-side script running inside the webview.
 *
 * Responsibilities:
 *   - Finds the <canvas> element provided by ScenePanel.ts's HTML
 *   - Sizes the canvas to fill the webview
 *   - Reads the selected screen type (injected by the host as
 *     `window.__SCREEN_TYPE__`) and instantiates it via the ScreenFactory
 *   - Starts the screen's animation loop
 *   - Listens for `screenType` messages from the host and switches screens
 *     live when the user changes the `vscode-scene.screen` setting
 *   - Handles window resizing by forwarding new dimensions to the screen
 *
 * When switching screens, the OLD canvas element is fully removed from the
 * DOM and a BRAND-NEW canvas is created in its place. This guarantees zero
 * leftover renderer state (e.g. buffers, child elements, stale attributes) —
 * the new screen always starts from a completely clean slate.
 *
 * NOTE: `window.__ASSETS_BASE_URI__` is injected by ScenePanel.ts
 * and is used by individual screens to build asset URLs.
 * ---------------------------------------------------------------------------
 */

// VS Code Scene - Panel script
/// <reference lib="dom" />

import { ScreenType, parseSceneType } from '../common/scenes';
import { ScreenConfig, BaseScreen } from './screens/BaseScreen';
import { createScreen } from './screens/ScreenFactory';

/** The currently active screen instance (null when none is running). */
let currentScreen: BaseScreen | null = null;

/** The currently active canvas element (replaced on every screen switch). */
let canvas: HTMLCanvasElement | null = null;

/** The screen type currently selected in the settings (string form). */
let currentScreenType: string = '';

/**
 * Maps a screen-type string (from the setting/global) to the ScreenType enum.
 * Falls back to the default scene for unknown values so the panel never crashes.
 *
 * @param value - the raw screen-type string
 * @returns the matching ScreenType enum value
 */
function toScreenType(value: string): ScreenType {
    return parseSceneType(value);
}

/**
 * Removes the old <canvas> from the DOM and creates a fresh one in its place.
 *
 * A brand-new element guarantees a completely clean drawing surface:
 * any child elements, leftover paint, or stale attributes left behind by a
 * previous renderer are gone for good.
 *
 * @returns the fresh canvas element
 */
function createFreshCanvas(): HTMLCanvasElement {
    const container = document.querySelector('.container') ?? document.body;

    // Remove the old canvas (if any) entirely.
    const oldCanvas = document.getElementById('canvas');
    if (oldCanvas) {
        oldCanvas.remove();
    }

    // Create and insert a brand-new canvas.
    const newCanvas = document.createElement('canvas');
    newCanvas.id = 'canvas';
    newCanvas.style.width = '100%';
    newCanvas.style.height = '100%';
    newCanvas.style.display = 'block';
    container.appendChild(newCanvas);

    return newCanvas;
}

/**
 * Sizes the current canvas to fill the webview and forwards the new
 * dimensions to the active screen so it can re-layout its content.
 */
function resizeCanvas() {
    if (!canvas) {
        return;
    }

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
 * Creates (or re-creates) the screen matching the given type on a fresh
 * canvas. Disposes the previous screen and replaces its canvas element.
 *
 * @param type - the ScreenType to instantiate
 */
function switchToScreen(type: ScreenType) {
    // Skip if the requested type is already active.
    if (currentScreenType === type && currentScreen) {
        return;
    }

    // Dispose the old screen first to stop its loop and free resources.
    if (currentScreen) {
        currentScreen.dispose();
        currentScreen = null;
    }

    // Replace the canvas with a completely fresh element so no leftover
    // renderer state survives from the previous screen.
    canvas = createFreshCanvas();
    resizeCanvas();

    const config: ScreenConfig = {
        type,
    };

    // Create and start the screen.
    const screen = createScreen(canvas, config);
    currentScreen = screen;
    currentScreenType = type;

    // `start()` may return a Promise (async screens). Handle errors if so.
    const result = screen.start();
    if (result instanceof Promise) {
        result.catch((err) => console.error('[Scene] Screen start error:', err));
    }
}

/**
 * Bootstraps the panel once the DOM is ready:
 * sizes the canvas, creates the screen from the injected setting,
 * listens for setting-change messages from the host, and handles resizes.
 */
async function main() {
    canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
    if (!canvas) {
        return;
    }

    // Use the screen type injected by the host (from the user setting).
    const initialType = (window as any).__SCREEN_TYPE__;
    switchToScreen(toScreenType(initialType));

    // Listen for setting changes: the host posts the new screen type and we
    // switch screens live without reloading the webview.
    window.addEventListener('message', (event: MessageEvent) => {
        const message = event.data;
        if (!message || message.type !== 'screenType') {
            return;
        }
        switchToScreen(toScreenType(message.value));
    });

    window.addEventListener('resize', resizeCanvas);
}

// Wait for the DOM to be ready before bootstrapping.
document.addEventListener('DOMContentLoaded', main);
