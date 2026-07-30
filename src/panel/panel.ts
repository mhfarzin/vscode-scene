// VS Code Screensaver - Panel script
/// <reference lib="dom" />

import { ScreenType } from './screens/ScreenType';
import { ScreenConfig, BaseScreen } from './screens/BaseScreen';
import { createScreen } from './screens/ScreenFactory';

let currentScreen: BaseScreen | null = null;

function resizeCanvas(canvas: HTMLCanvasElement) {
    const w = window.innerWidth;
     const h = window.innerHeight;

    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    if (currentScreen) {
        currentScreen.resize(w, h);
    }
}

function createOrSwitchScreen(canvas: HTMLCanvasElement) {
    // Dispose old screen if exists
    if (currentScreen) {
        currentScreen.dispose();
        currentScreen = null;
    }

    // Clear canvas
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    const config: ScreenConfig = {
        type: ScreenType.SkyPilot,
    };

    const screen = createScreen(canvas, config);
    currentScreen = screen;
    const result = screen.start();
    if (result instanceof Promise) {
        result.catch((err) => console.error('[Screensaver] Screen start error:', err));
    }
}

async function main() {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas) return;

    resizeCanvas(canvas);
    createOrSwitchScreen(canvas);

    window.addEventListener('resize', () => resizeCanvas(canvas));
}

document.addEventListener('DOMContentLoaded', main);
