/**
 * SkyPilotScreen.ts
 * ---------------------------------------------------------------------------
 * A Pixi.js-based screensaver scene featuring:
 *   1. A light-blue sky background
 *   2. Drifting clouds that slowly move from left to right
 *   3. Colorful airplanes (Blue/Green/Red/Yellow) that fly across the screen
 *
 * The screen uses the Canvas2D renderer (`preference: 'canvas'`) because
 * VS Code WebViews do NOT support WebGL.
 *
 * Lifecycle (per the BaseScreen contract):
 *   - `init()`      : no-op — Pixi is set up asynchronously in `start()`
 *   - `update()`    : moves clouds & planes, animates propeller frames
 *   - `render()`    : manually renders the Pixi stage each frame
 *   - `resize()`    : resizes the Pixi renderer to match the canvas
 *   - `dispose()`   : stops the loop, cleans up timers & Pixi resources
 * ---------------------------------------------------------------------------
 */

import { Application, Sprite, Texture } from 'pixi.js';
import { BaseScreen, ScreenConfig } from './BaseScreen';

/**
 * Builds a fully-qualified asset URL from a path relative to `assets/`.
 * Falls back to an empty string if `__ASSETS_BASE_URI__` is not available.
 *
 * @param relativePath - e.g. 'screens/sky-pilot/cloud1.PNG'
 * @returns the absolute webview URL for the asset
 */
function assetsUrl(relativePath: string): string {
    const base = (window as any).__ASSETS_BASE_URI__ || '';
    return `${base}/${relativePath}`.replace(/\/+/g, '/');
}

/** Available airplane colors. Each color has 3 propeller frames. */
const PLANE_COLORS = ['Blue', 'Green', 'Red', 'Yellow'];

/** Time (ms) between propeller frame swaps → controls prop spin speed. */
const FRAME_INTERVAL = 80;

/** Light-blue background color for the sky (no background image). */
const SKY_COLOR = 0x6eb7e9;

/** Cloud sprite image files to choose from. */
const CLOUD_FILES = ['cloud1.PNG', 'cloud2.PNG', 'cloud3.PNG'];

/** Cloud width as a fraction of the screen width (0.7 = 70%). */
const CLOUD_WIDTH_RATIO = 0.5;

/** Random extra width added on top of CLOUD_WIDTH_RATIO. */
const CLOUD_WIDTH_RANDOM = 0.15;

/** Fixed horizontal drift speed (px per frame) for ALL clouds. */
const CLOUD_SPEED = 0.2;

/** Opacity applied to every cloud sprite (0..1). */
const CLOUD_ALPHA = 0.7;

/** Min delay (ms) before spawning the next cloud. */
const CLOUD_SPAWN_DELAY_MIN = 10000;

/** Max delay (ms) before spawning the next cloud. */
const CLOUD_SPAWN_DELAY_MAX = 12000;

/** Maximum number of planes allowed on screen at the same time. */
const MAX_PLANES = 1;

/** Scale factor for airplane sprites (0.4 = 40% of the original image size). */
const PLANE_SCALE = 0.5;

/**
 * A set of 3 textures (propeller frames) belonging to a single plane color.
 */
interface PlaneFrames {
    /** [frame0, frame1, frame2] — cycled to animate the propeller. */
    textures: Texture[];
}

/**
 * Runtime state for one active airplane.
 */
interface PlaneState {
    /** The Pixi sprite rendered on stage. */
    sprite: Sprite;
    /** The 3 propeller frames for this plane's color. */
    frames: PlaneFrames;
    /** Current horizontal position (px). */
    x: number;
    /** Horizontal movement speed (px per frame). */
    speed: number;
    /** Index into `frames.textures` — which prop frame is showing. */
    frameIndex: number;
    /** Timestamp (ms) when the prop frame was last swapped. */
    lastFrameTime: number;
    /** 1 = flying right, -1 = flying left (sprite is flipped). */
    direction: 1 | -1;
}

/**
 * Runtime state for one drifting cloud.
 */
interface CloudState {
    /** The Pixi sprite rendered on stage. */
    sprite: Sprite;
    /** Horizontal drift speed (px per frame). */
    speed: number;
}

/**
 * SkyPilotScreen — the main screensaver scene.
 *
 * Renders a sky-blue background with drifting clouds and periodically
 * spawning airplanes that fly across the screen.
 *
 * Clouds are simple: every 2–5 seconds a new cloud enters from the
 * left edge and drifts right until it exits, then it is removed.
 * No counts, no overlap checks — just endless gentle cloud flow.
 */
export class SkyPilotScreen extends BaseScreen {
    /** The Pixi Application (renderer + stage). null until initialized. */
    private app: Application | null = null;

    /** All currently-active airplane sprites + their state. */
    private planes: PlaneState[] = [];

    /** All currently-active cloud sprites + their state. */
    private clouds: CloudState[] = [];

    /** Loaded propeller-frame sets, one per successfully-loaded color. */
    private allFrames: PlaneFrames[] = [];

    /** Loaded cloud textures (may be 0–3 depending on load success). */
    private cloudTextures: Texture[] = [];

    /** True once all assets are loaded and the scene is ready to animate. */
    private ready: boolean = false;

    /** Interval handle that attempts to spawn a new plane every 2s. */
    private spawnInterval: ReturnType<typeof setInterval> | null = null;

    /** Timer handle that spawns clouds on a 2–5s loop. */
    private cloudTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(canvas: HTMLCanvasElement, config: ScreenConfig) {
        super(canvas, config);
    }

    /**
     * Entry point. Initializes Pixi and then starts the BaseScreen
     * animation loop (which drives `update()`/`render()`).
     */
    async start(): Promise<void> {
        await this._initPixi();
        super.start();
    }

    /**
     * Initializes Pixi, loads all assets, and kicks off the spawners.
     */
    private async _initPixi(): Promise<void> {
        // Clean up any previous Pixi instance (e.g. after a re-init).
        if (this.app) {
            this.stop();
            if (this.cloudTimer) {
                clearTimeout(this.cloudTimer);
                this.cloudTimer = null;
            }
            this.app.destroy(true, { children: true });
            this.app = null;
            this.planes = [];
            this.clouds = [];
            this.allFrames = [];
            this.cloudTextures = [];
        }

        // Create the Pixi application on the existing canvas.
        // `preference: 'canvas'` is REQUIRED — VS Code WebViews have no WebGL.
        this.app = new Application();
        await this.app.init({
            canvas: this.canvas,
            width: this.canvas.width,
            height: this.canvas.height,
            backgroundColor: SKY_COLOR,
            preference: 'canvas',
        });

        // ---- Load cloud images -----------------------------------------
        for (const file of CLOUD_FILES) {
            try {
                const url = assetsUrl('screens/sky-pilot/' + file);
                const img = await this._loadImage(url);
                this.cloudTextures.push(Texture.from(img));
            } catch (err) {
                console.error(`[SkyPilot] Failed to load cloud ${file}`, err);
            }
        }

        // ---- Load all plane colors (each color = 3 propeller frames) ----
        for (const color of PLANE_COLORS) {
            const textures: Texture[] = [];
            let ok = true;
            for (let i = 1; i <= 3; i++) {
                try {
                    const url = assetsUrl(`screens/sky-pilot/plane${color}${i}.png`);
                    const img = await this._loadImage(url);
                    textures.push(Texture.from(img));
                } catch (err) {
                    console.error(`[SkyPilot] Failed to load plane${color}${i}.png`, err);
                    ok = false;
                    break;
                }
            }
            // Only register the color if all 3 frames loaded successfully.
            if (ok && textures.length === 3) {
                this.allFrames.push({ textures });
            }
        }

        // The scene is ready only if at least one plane variant is available.
        this.ready = this.allFrames.length > 0;
        console.log(
            `[SkyPilot] Loaded ${this.allFrames.length} plane variants, ` +
            `${this.cloudTextures.length} cloud types`
        );

        // ---- Start spawners --------------------------------------------
        // Planes: try every 2s; first plane spawns almost immediately.
        this.spawnInterval = setInterval(() => this._trySpawn(), 2000);
        setTimeout(() => this._trySpawn(), 300);

        // Clouds: spawn one every 2–5 seconds.
        this._scheduleCloudSpawn(300);
    }

    /**
     * Loads an image via an HTMLImageElement and resolves once it has
     * finished loading. More reliable than `Texture.from(url)` inside
     * a webview context.
     *
     * @param url - absolute URL of the image to load
     * @returns a Promise resolving to the loaded HTMLImageElement
     */
    private _loadImage(url: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load: ' + url));
            img.src = url;
        });
    }

    /**
     * Attempts to spawn a single airplane.
     * No-op if the scene isn't ready or the max plane count is already reached.
     *
     * The plane starts off-screen (left or right, chosen randomly), enters
     * at a random altitude, and exits on the opposite side.
     */
    private _trySpawn(): void {
        if (!this.app || !this.ready) return;
        if (this.planes.length >= MAX_PLANES) return;

        const w = this.app.screen.width;
        const h = this.app.screen.height;

        // Random direction, speed, and altitude.
        const direction: 1 | -1 = Math.random() > 0.5 ? 1 : -1;
        const speed = 0.6 + Math.random() * 0.9;
        const y = 50 + Math.random() * (h * 0.5);

        // Start fully off-screen.
        const x = direction === 1 ? -100 : w + 100;

        // Pick a random color variant.
        const frames = this.allFrames[Math.floor(Math.random() * this.allFrames.length)];

        const sprite = new Sprite(frames.textures[0]);
        sprite.anchor.set(0.5, 0.5);
        sprite.scale.set(PLANE_SCALE);
        sprite.x = x;
        sprite.y = y;

        // Flip horizontally so the plane faces the direction it is flying.
        if (direction === -1) {
            sprite.scale.x = -PLANE_SCALE;
        }

        this.app.stage.addChild(sprite);

        // Keep the plane on the topmost layer so clouds never cover it.
        this.app.stage.setChildIndex(sprite, this.app.stage.children.length - 1);

        this.planes.push({
            sprite,
            frames,
            x,
            speed,
            frameIndex: 0,
            lastFrameTime: performance.now(),
            direction,
        });
    }

    /**
     * Schedules the next cloud spawn after a random delay
     * (CLOUD_SPAWN_DELAY_MIN..CLOUD_SPAWN_DELAY_MAX ms).
     */
    private _scheduleCloudSpawn(delay?: number): void {
        if (this.cloudTimer) {
            clearTimeout(this.cloudTimer);
        }
        const wait =
            delay ??
            CLOUD_SPAWN_DELAY_MIN + Math.random() * (CLOUD_SPAWN_DELAY_MAX - CLOUD_SPAWN_DELAY_MIN);
        this.cloudTimer = setTimeout(() => this._spawnCloud(), wait);
    }

    /**
     * Spawns a single cloud entering from the left edge.
     * Picks a random texture, size, altitude, and drift speed.
     */
    private _spawnCloud(): void {
        if (!this.app) {
            return;
        }
        if (this.cloudTextures.length > 0) {
            // Pick a random cloud texture.
            const tex = this.cloudTextures[Math.floor(Math.random() * this.cloudTextures.length)];

            const sprite = new Sprite(tex);
            sprite.anchor.set(0.5, 0.5);

            // Scale the cloud so its width is a fraction of the screen width.
            const targetWidth = this.app.screen.width * (CLOUD_WIDTH_RATIO + Math.random() * CLOUD_WIDTH_RANDOM);
            sprite.scale.set(targetWidth / tex.width);

            // Enter from the left edge, fully off-screen.
            sprite.x = -sprite.width / 2;

            // Random altitude in the upper portion of the screen.
            sprite.y = 40 + Math.random() * (this.app.screen.height * 0.5);

            this.app.stage.addChild(sprite);

            // Apply uniform opacity so no cloud looks too heavy.
            sprite.alpha = CLOUD_ALPHA;

            this.clouds.push({
                sprite,
                speed: CLOUD_SPEED, // fixed speed for all clouds
            });
        }

        // Schedule the next cloud.
        this._scheduleCloudSpawn();
    }

    // ---- BaseScreen abstract implementations ----------------------------

    /** No-op — Pixi is initialized asynchronously in `start()`. */
    init(): void {
        // Nothing to do here.
    }

    /**
     * Called every frame by the BaseScreen animation loop.
     * Advances clouds and planes, animates propeller frames,
     * and removes objects that have left the screen.
     */
    update(_deltaTime: number): void {
        if (!this.app || !this.ready) return;

        const now = performance.now();
        const w = this.app.screen.width;

        // ---- Move clouds (slow drift to the right) ----------------------
        for (let i = this.clouds.length - 1; i >= 0; i--) {
            const cloud = this.clouds[i];
            cloud.sprite.x += cloud.speed;

            // Remove once fully off-screen right.
            if (cloud.sprite.x > w + cloud.sprite.width / 2) {
                this.app.stage.removeChild(cloud.sprite);
                cloud.sprite.destroy();
                this.clouds.splice(i, 1);
            }
        }

        // ---- Move planes & animate their propellers ---------------------
        for (let i = this.planes.length - 1; i >= 0; i--) {
            const plane = this.planes[i];

            // Advance horizontal position.
            plane.x += plane.speed * plane.direction;
            plane.sprite.x = plane.x;

            // Cycle propeller frames every FRAME_INTERVAL ms.
            if (now - plane.lastFrameTime > FRAME_INTERVAL) {
                plane.frameIndex = (plane.frameIndex + 1) % plane.frames.textures.length;
                plane.sprite.texture = plane.frames.textures[plane.frameIndex];
                plane.lastFrameTime = now;
            }

            // Remove the plane once it has fully exited the screen.
            if ((plane.direction === 1 && plane.x > w + 150) ||
                (plane.direction === -1 && plane.x < -150)) {
                this.app.stage.removeChild(plane.sprite);
                plane.sprite.destroy();
                this.planes.splice(i, 1);
            }
        }
    }

    /**
     * Called every frame. Manually renders the Pixi stage because
     * Pixi's auto-ticker does not run inside a VS Code WebView.
     */
    render(): void {
        if (this.app) {
            this.app.renderer.render({ container: this.app.stage });
        }
    }

    /**
     * Called when the sidebar/canvas is resized.
     * Resizes the Pixi renderer to match.
     */
    resize(width: number, height: number): void {
        this.canvas.width = width;
        this.canvas.height = height;
        if (this.app) {
            this.app.renderer.resize(width, height);
        }
    }

    /**
     * Full cleanup: stops the animation loop, clears all timers,
     * destroys the Pixi app, and resets all state.
     */
    dispose(): void {
        this.stop();

        // Stop the plane spawner.
        if (this.spawnInterval) {
            clearInterval(this.spawnInterval);
            this.spawnInterval = null;
        }

        // Stop the cloud spawner.
        if (this.cloudTimer) {
            clearTimeout(this.cloudTimer);
            this.cloudTimer = null;
        }

        // Destroy Pixi and all its children.
        if (this.app) {
            this.app.destroy(true, { children: true });
            this.app = null;
        }

        // Reset state.
        this.planes = [];
        this.clouds = [];
        this.allFrames = [];
        this.cloudTextures = [];
        this.ready = false;
    }
}
