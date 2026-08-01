/**
 * StarsScreen.ts
 * ---------------------------------------------------------------------------
 * A pure Canvas2D screensaver scene (no Pixi.js).
 *
 * Renders 200 white stars that slowly drift upward and twinkle.
 * When a star exits the top of the screen it wraps around to the bottom
 * with a new random X position, giving an endless drifting effect.
 * ---------------------------------------------------------------------------
 */

import { BaseScreen, ScreenConfig } from './BaseScreen';

/**
 * Runtime state for a single star.
 */
interface Star {
    /** Horizontal position (px). */
    x: number;
    /** Vertical position (px). */
    y: number;
    /** Radius of the star (px). */
    size: number;
    /** Vertical drift speed (px per frame). */
    speed: number;
    /** Random phase offset (0..1) used to vary twinkle timing. */
    brightness: number;
}

/** Total number of stars on screen. */
const NUM_STARS = 200;

/**
 * StarsScreen — a simple starfield with upward drifting, twinkling stars.
 */
export class StarsScreen extends BaseScreen {
    /** All active star objects. */
    private stars: Star[] = [];

    /** Accumulated time (s) — used for the twinkle animation. */
    private time: number = 0;

    constructor(canvas: HTMLCanvasElement, config: ScreenConfig) {
        super(canvas, config);
    }

    /**
     * One-time setup: populates the starfield with randomly distributed stars.
     */
    init(): void {
        this.stars = [];

        for (let i = 0; i < NUM_STARS; i++) {
            this.stars.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: Math.random() * 2 + 0.5,
                speed: Math.random() * 0.5 + 0.1,
                brightness: Math.random(),
            });
        }
    }

    /**
     * Per-frame logic: advances time and drifts stars upward.
     * Stars that leave the top wrap around to the bottom.
     */
    update(_deltaTime: number): void {
        this.time += 0.01;

        for (const star of this.stars) {
            // Slow upward drift.
            star.y -= star.speed * 0.2;

            // Wrap to the bottom with a random X when leaving the top.
            if (star.y < 0) {
                star.y = this.canvas.height;
                star.x = Math.random() * this.canvas.width;
            }
        }
    }

    /**
     * Per-frame drawing: clears the canvas black and draws each star
     * with a twinkling opacity.
     */
    render(): void {
        const ctx = this.ctx;

        // Paint the background black.
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw each star with a sinusoidal twinkle (0.4 … 1.0 alpha).
        for (const star of this.stars) {
            const twinkle = Math.sin(this.time * 3 + star.brightness * 10) * 0.3 + 0.7;
            ctx.fillStyle = `rgba(255, 255, 255, ${twinkle})`;
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /**
     * Resizes the canvas and re-seeds the starfield so stars
     * distribute across the new dimensions.
     */
    resize(width: number, height: number): void {
        this.canvas.width = width;
        this.canvas.height = height;
        this.init();
    }

    /**
     * Stops the animation loop and clears the star array.
     */
    dispose(): void {
        this.stop();
        this.stars = [];
    }
}
