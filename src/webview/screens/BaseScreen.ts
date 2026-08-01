/**
 * BaseScreen.ts
 * ---------------------------------------------------------------------------
 * Abstract base class for all screensaver screens.
 *
 * Every screen implements the same lifecycle:
 *   1. `init()`    — one-time setup (spawn objects, load state, etc.)
 *   2. `update()`  — per-frame logic (movement, collisions, timers)
 *   3. `render()`  — per-frame drawing (canvas context or Pixi stage)
 *   4. `resize()`  — called when the sidebar/webview changes size
 *   5. `dispose()` — full cleanup before the screen is replaced
 *
 * `start()` boots the animation loop; `stop()` halts it.
 * `start()` may be `async` (e.g. Pixi-based screens must await app.init()).
 * ---------------------------------------------------------------------------
 */

import { ScreenType } from './ScreenType';

/**
 * Configuration passed to a screen at construction time.
 * Currently only carries the screen type, but can be extended later
 * (e.g. screen-specific options like colors, speeds, counts).
 */
export interface ScreenConfig {
    /** Decides which screen implementation the factory instantiates. */
    type: ScreenType;
}

/**
 * Abstract base class for all screensaver screens.
 *
 * Subclasses must implement `init`, `update`, `render`, `resize`, and `dispose`.
 * Canvas2D-based screens use the lazy `ctx` getter; Pixi-based screens
 * ignore it and manage their own renderer.
 */
export abstract class BaseScreen {
    /** The <canvas> element this screen draws onto. */
    protected canvas: HTMLCanvasElement;

    /** The configuration this screen was created with. */
    protected config: ScreenConfig;

    /** ID of the currently scheduled requestAnimationFrame (if running). */
    protected _animFrameId: number | undefined;

    /**
     * Cached 2D context handle.
     * Lazy — only created when a Canvas2D screen actually requests it,
     * so Pixi-based screens never pay the cost of `getContext('2d')`.
     */
    private _ctx: CanvasRenderingContext2D | null = null;

    constructor(canvas: HTMLCanvasElement, config: ScreenConfig) {
        this.canvas = canvas;
        this.config = config;
    }

    /**
     * Lazy getter for the Canvas 2D drawing context.
     * Only intended for Canvas2D-based screens (e.g. StarsScreen).
     *
     * @returns the canvas's 2D rendering context
     */
    protected get ctx(): CanvasRenderingContext2D {
        if (!this._ctx) {
            this._ctx = this.canvas.getContext('2d')!;
        }
        return this._ctx;
    }

    /** One-time setup. Called once when the screen is created. */
    abstract init(): void;

    /** Per-frame logic. Called every animation frame. */
    abstract update(deltaTime: number): void;

    /** Per-frame drawing. Called every animation frame. */
    abstract render(): void;

    /** Handles canvas/sidebar size changes. */
    abstract resize(width: number, height: number): void;

    /** Full cleanup. Called once when the screen is replaced. */
    abstract dispose(): void;

    /**
     * Starts the animation loop.
     *
     * @returns `void` for synchronous screens, or a Promise for async screens.
     *          Callers must check `instanceof Promise` before chaining `.catch()`.
     */
    start(): void | Promise<void> {
        this.init();
        this.loop(0);
    }

    /**
     * The animation loop body. Computes delta time, runs update + render,
     * then schedules the next frame.
     */
    protected loop = (timestamp: number) => {
        // Delta time since the previous frame (ms).
        const delta = timestamp - (this._lastTimestamp ?? timestamp);
        this._lastTimestamp = timestamp;

        this.update(delta);
        this.render();

        // Schedule the next frame.
        this._animFrameId = requestAnimationFrame(this.loop);
    };

    /** Timestamp (ms) of the most recent frame — used to compute delta. */
    private _lastTimestamp: number = 0;

    /**
     * Stops the animation loop. Safe to call multiple times.
     */
    stop(): void {
        if (this._animFrameId !== undefined) {
            cancelAnimationFrame(this._animFrameId);
            this._animFrameId = undefined;
        }
    }
}
