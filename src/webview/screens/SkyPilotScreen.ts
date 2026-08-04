/**
 * SkyPilotScreen.ts
 * ---------------------------------------------------------------------------
 * A Pixi.js-based screensaver scene featuring:
 *   1. A light-blue sky background
 *   2. Procedurally generated drifting clouds
 *   3. Colorful airplanes (Blue/Green/Red/Yellow) that fly across the screen
 *
 * Clouds are generated with circles (Pixi Graphics) instead of PNG images —
 * each cloud is a group of overlapping circles with a flat bottom, drifting
 * gently from left to right. The generation logic mirrors the classic
 * "fluff cloud" algorithm: a big center circle + descending side circles +
 * end circles that fill out the bottom.
 *
 * Layers: clouds live in a `cloudLayer` Container and planes in a
 * `planeLayer` Container added AFTER the cloud layer, so planes always
 * render on top of clouds (no per-frame z-index juggling).
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

import { Application, Sprite, Texture, Graphics, Container } from 'pixi.js';
import { BaseScreen, ScreenConfig } from './BaseScreen';
import { BalancedDeck } from '../utils/random';

/**
 * Builds a fully-qualified asset URL from a path relative to `assets/`.
 * Falls back to an empty string if `__ASSETS_BASE_URI__` is not available.
 *
 * @param relativePath - e.g. 'screens/sky-pilot/planeBlue1.png'
 * @returns the absolute webview URL for the asset
 */
function assetsUrl(relativePath: string): string {
    const base = (window as any).__ASSETS_BASE_URI__ || '';
    // Trim ONE trailing slash (if any) from base, then add the relative path.
    // A naive `.replace(/\/+/g, '/')` would also collapse the `//` protocol
    // in `http://` → `http:/` and break the URL.
    return `${base.replace(/\/+$/, '')}/${relativePath}`;
}

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

/** Available airplane colors. Each color has 3 propeller frames. */
const PLANE_COLORS = ['Blue', 'Green', 'Red', 'Yellow'];

/** Time (ms) between propeller frame swaps → controls prop spin speed. */
const FRAME_INTERVAL = 80;

/** Light-blue background color for the sky (matches the original sample). */
const SKY_COLOR = 0x9bd2f8;

/** Fixed horizontal drift speed (px per frame) for ALL clouds. */
const CLOUD_SPEED = 0.2;

/** Min delay (ms) before spawning the next cloud. */
const CLOUD_SPAWN_DELAY_MIN = 15000;

/** Max delay (ms) before spawning the next cloud. */
const CLOUD_SPAWN_DELAY_MAX = 20000;

/** Solid white color for cloud fill (opaque — hides overlapping circles). */
const CLOUD_COLOR = 0xffffff;

/** Base radius (px) of the cloud's center fluff. */
const CLOUD_BASE_SIZE = 22;

/** Random variation (px) added to the base size → keeps clouds similar. */
const CLOUD_SIZE_VARIATION = 5;

/** Maximum number of planes allowed on screen at the same time. */
const MAX_PLANES = 1;

/** Interval (ms) between plane spawn attempts. */
const PLANE_SPAWN_INTERVAL = 2000;

/** Scale factor for airplane sprites (0.6 = 60% of the original image size). */
const PLANE_SCALE = 0.5;

// --------------------------------------------------------------------------
// Cloud geometry
// --------------------------------------------------------------------------

/**
 * A single "fluff" circle that makes up part of a cloud.
 */
interface Fluff {
    /** Horizontal center (px), relative to the cloud Graphics origin. */
    x: number;
    /** Vertical center (px), relative to the cloud Graphics origin. */
    y: number;
    /** Circle radius (px). */
    r: number;
}

/**
 * All the geometric data for a generated cloud.
 */
interface CloudData {
    /** Circles composing the cloud. */
    fluffs: Fluff[];
    /** Leftmost X extents. */
    x1: number;
    /** Rightmost X extents. */
    x2: number;
    /** Topmost Y extents. */
    y1: number;
    /** Bottom Y (the flat base line). */
    y2: number;
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
 * A set of 3 textures (propeller frames) belonging to a single plane color.
 */
interface PlaneFrames {
    /** [frame0, frame1, frame2] — cycled to animate the propeller. */
    textures: Texture[];
}

/**
 * Runtime state for one drifting cloud.
 */
interface CloudState {
    /** A Container holding the cloud Graphics + its shadow. */
    gfx: Container;
    /** Half-width of the cloud — used for removal checks. */
    halfW: number;
}

// --------------------------------------------------------------------------
// Cloud generation helpers (mirrors the classic fluff-cloud algorithm)
// --------------------------------------------------------------------------

/** Random float between min and max. */
const rand = (min: number, max: number) => Math.random() * (max - min) + min;

/** Random int in [0, max). */
const randInt = (max: number) => Math.floor(Math.random() * max);

/** Euclidean distance between two points. */
const dist = (x1: number, y1: number, x2: number, y2: number) =>
    Math.abs(Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2));

/**
 * Calculates the position of the next smaller circle placed to the LEFT
 * of a previous one — offset downward and overlapping.
 */
function calcPositionLeft(prev: Fluff, r: number): Fluff {
    const r1 = prev.r;
    const r2 = r;
    // Very small hLine keeps circles tightly overlapping (natural cloud look).
    const hLine = randInt(r1 / 10);
    const a = r1 - r2 - hLine;
    const h = r1 + r2;
    const b = Math.sqrt(h * h - a * a);
    return { x: prev.x - b, y: prev.y + a, r: r2 };
}

/**
 * Calculates the position of the next smaller circle placed to the RIGHT
 * of a previous one — offset downward and overlapping.
 */
function calcPositionRight(prev: Fluff, r: number): Fluff {
    const r1 = prev.r;
    const r2 = r;
    // Very small hLine keeps circles tightly overlapping (natural cloud look).
    const hLine = randInt(r1 / 8);
    const a = r1 - r2 - hLine;
    const h = r1 + r2;
    const b = Math.sqrt(h * h - a * a);
    return { x: prev.x + b, y: prev.y + a, r: r2 };
}

/**
 * Generates a cloud as a set of overlapping circles ("fluffs").
 *
 * Algorithm:
 *   1. One big center circle (scales to screen — medium sized).
 *   2. At least 1 pair (up to 3) of smaller circles added alternately
 *      left/right, each slightly lower than the previous (descending chain).
 *   3. Two large end circles fill the bottom-left and bottom-right.
 *   4. The flat bottom is the lowest extent of all circles.
 *
 * @param rectW - screen width (used to scale cloud size)
 * @param rectH - screen height (used to scale cloud size)
 * @returns geometry data for the generated cloud
 */
function generateCloud(rectW: number, rectH: number): CloudData {
    // Consistent medium size: base radius + small random variation,
    // so all clouds look similar in scale (never tiny, never huge).
    const bigR = CLOUD_BASE_SIZE + Math.random() * CLOUD_SIZE_VARIATION;

    const fluffs: Fluff[] = [];
    const bigFluff: Fluff = {
        x: randInt(rectW),
        y: randInt(rectH),
        r: bigR,
    };

    const minSize = bigFluff.r / 3;
    const maxSize = bigFluff.r;

    let prevLeft = bigFluff;
    let prevRight = bigFluff;

    // Always at least one pair of side circles so the cloud has a
    // recognizable fluffy silhouette (never just a single circle).
    const amount = 1 + randInt(2); // 1..3 pairs
    fluffs.push(bigFluff);

    for (let index = 0; index < amount; index += 2) {
        let rL = rand(minSize, maxSize);
        let rR = index + 1 < amount ? rand(minSize, maxSize) : 0;

        // Occasionally swap the two radii for variety.
        if (Math.random() < 0.5) {
            const t = rL;
            rL = rR;
            rR = t;
        }

        // Left side circle.
        const newL = calcPositionLeft(prevLeft, rL);
        fluffs.unshift(newL);
        prevLeft = newL;

        // Right side circle.
        if (rR > 0) {
            const newR = calcPositionRight(prevRight, rR);
            fluffs.push(newR);
            prevRight = newR;
        }
    }

    // Extents of the cloud.
    const y2 = fluffs.reduce((prev, cur) => Math.max(prev, cur.y + cur.r), 0); // bottom
    const y1 = fluffs.reduce((prev, cur) => Math.min(prev, cur.y - cur.r), rectH); // top
    const x1 = fluffs.reduce((prev, cur) => Math.min(prev, cur.x - cur.r), rectW); // left
    const x2 = fluffs.reduce((prev, cur) => Math.max(prev, cur.x + cur.r), 0); // right

    // End circles fill the bottom so the cloud has a full rounded base.
    const createEndLeft = () => {
        const first = fluffs[0];
        const diam = Math.max(minSize * 2, y2 - first.y);
        const r = diam / 2;
        const pos = calcPositionLeft(first, r);
        const offset = dist(first.x, first.y, pos.x, pos.y) - (first.r + r);
        fluffs.unshift({ x: pos.x + offset, y: y2 - r, r });
    };

    const createEndRight = () => {
        const last = fluffs[fluffs.length - 1];
        const diam = Math.max(minSize * 2, y2 - last.y);
        const r = diam / 2;
        const pos = calcPositionRight(last, r);
        const offset = dist(last.x, last.y, pos.x, pos.y) - (last.r + r);
        fluffs.push({ x: pos.x - offset, y: y2 - r, r });
    };

    createEndLeft();
    createEndRight();

    return { fluffs, x1, x2, y1, y2 };
}

/**
 * Draws a cloud shape (the same path) into a Graphics object.
 *
 * @param cloud - geometry data from `generateCloud`
 * @param color - fill color for the shape
 * @returns a Graphics object with the cloud shape filled
 */
function drawCloudShape(cloud: CloudData, color: number): Graphics {
    const gfx = new Graphics();

    // Offset everything so the cloud is centered at (0,0).
    const cx = (cloud.x1 + cloud.x2) / 2;
    const cy = (cloud.y1 + cloud.y2) / 2;
    const fluffs = cloud.fluffs.map((f) => ({ x: f.x - cx, y: f.y - cy, r: f.r }));
    const bottomY = cloud.y2 - cy;

    // Trace the outline: circle arcs + close across the bottom.
    gfx.beginPath();
    for (const f of fluffs) {
        gfx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    }
    gfx.moveTo(fluffs[0].x, bottomY);
    for (const f of fluffs) {
        gfx.lineTo(f.x, f.y);
    }
    gfx.lineTo(fluffs[fluffs.length - 1].x, bottomY);
    gfx.closePath();

    // Solid uniform fill — overlapping circle layers are NOT visible.
    gfx.fill(color);

    return gfx;
}

/**
 * Builds a cloud visually: a soft gray shadow drawn slightly offset
 * behind a solid white cloud. Both are grouped in a Container so the
 * pair moves together.
 *
 * @param cloud - geometry data from `generateCloud`
 * @returns a Container (shadow + cloud) centered at its origin
 */
function cloudToGraphics(cloud: CloudData): Container {
    const wrapper = new Container();

    // Shadow: light gray-blue = visual equivalent of the original's
    // rgba(80, 80, 80, 0.2) blended over the #9bd2f8 sky, but fully solid.
    const shadow = drawCloudShape(cloud, 0x8eb8d6);
    shadow.position.set(6, 6);
    wrapper.addChild(shadow);

    // Main cloud: opaque white on top.
    const body = drawCloudShape(cloud, CLOUD_COLOR);
    wrapper.addChild(body);

    return wrapper;
}

// --------------------------------------------------------------------------
// SkyPilotScreen
// --------------------------------------------------------------------------

/**
 * SkyPilotScreen — the main screensaver scene.
 *
 * Renders a sky-blue background with procedurally generated drifting
 * clouds and periodically spawning airplanes flying across the screen.
 *
 * Clouds and planes live in separate containers: the plane layer is added
 * AFTER the cloud layer so planes always render on top.
 */
export class SkyPilotScreen extends BaseScreen {
    /** True once `dispose()` has been called — guards async `start()`. */
    private disposed: boolean = false;

    /** The Pixi Application (renderer + stage). null until initialized. */
    private app: Application | null = null;

    /** Container holding all cloud Graphics objects (rendered first). */
    private cloudLayer: Container | null = null;

    /** Container holding all plane sprites (rendered on top of clouds). */
    private planeLayer: Container | null = null;

    /** All currently-active cloud sprites + their state. */
    private clouds: CloudState[] = [];

    /** All currently-active airplane sprites + their state. */
    private planes: PlaneState[] = [];

    /** Loaded propeller-frame sets, one per successfully-loaded color. */
    private allFrames: PlaneFrames[] = [];

    /** True once all assets are loaded and the scene is ready to animate. */
    private ready: boolean = false;

    /** Accumulated ms since the last plane-spawn attempt (2s interval). */
    private planeSpawnTimer: number = 0;

    /** Accumulated ms since the last cloud spawn. */
    private cloudSpawnTimer: number = 0;

    /** Random delay (ms) until the next cloud spawn. */
    private cloudSpawnDelay: number = CLOUD_SPAWN_DELAY_MAX;

    /** Balanced deck for cloud altitudes — spreads Y values evenly. */
    private cloudYDeck: BalancedDeck = new BalancedDeck(4);

    /** Balanced deck for plane altitudes — spreads Y values evenly. */
    private planeYDeck: BalancedDeck = new BalancedDeck(4);

    constructor(canvas: HTMLCanvasElement, config: ScreenConfig) {
        super(canvas, config);
    }

    /**
     * Entry point. Initializes Pixi and then starts the BaseScreen
     * animation loop (which drives `update()`/`render()`).
     */
    async start(): Promise<void> {
        this.disposed = false;
        await this._initPixi();

        // Guard: the screen may have been disposed while we were awaiting
        // asset loading. If so, do NOT start the animation loop.
        if (this.disposed) {
            return;
        }

        super.start();
    }

    /**
     * Initializes Pixi, loads plane assets, and kicks off the spawners.
     */
    private async _initPixi(): Promise<void> {
        // Clean up any previous Pixi instance (e.g. after a re-init).
        // IMPORTANT: pass `false` for removeView so the canvas stays in
        // the DOM — `true` would detach it and leave a black panel.
        if (this.app) {
            this.stop();
            this.app.destroy(false, { children: true });
            this.app = null;
            this.cloudLayer = null;
            this.planeLayer = null;
            this.planes = [];
            this.clouds = [];
            this.allFrames = [];
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

        // Bail out if the screen was disposed while Pixi was initializing.
        if (this.disposed) {
            this.app?.destroy(false, { children: true });
            this.app = null;
            return;
        }

        // Create the two layers. Order matters:
        // cloudLayer added first → rendered first (background);
        // planeLayer added afterwards → always on top of clouds.
        this.cloudLayer = new Container();
        this.planeLayer = new Container();
        this.app.stage.addChild(this.cloudLayer, this.planeLayer);

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
            // Bail out if the screen was disposed while assets were loading.
            if (this.disposed) {
                return;
            }
            // Only register the color if all 3 frames loaded successfully.
            if (ok && textures.length === 3) {
                this.allFrames.push({ textures });
            }
        }

        // The scene is ready only if at least one plane variant is available.
        this.ready = this.allFrames.length > 0;
        console.log(`[SkyPilot] Loaded ${this.allFrames.length} plane variants`);

        // ---- Start spawners --------------------------------------------
        // Spawn logic is driven by the requestAnimationFrame loop in
        // `update()` using accumulated delta time — NOT by setTimeout /
        // setInterval. Browser timers keep firing while the window is
        // minimized, which would queue up a burst of clouds/planes that
        // all appear at once on restore. rAF pauses when hidden, so no
        // spawns accumulate in the background.

        // First plane spawns almost immediately.
        this.planeSpawnTimer = PLANE_SPAWN_INTERVAL - 300;

        // First cloud spawns after a short warm-up delay.
        this.cloudSpawnTimer = 0;
        this.cloudSpawnDelay = 300;
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

        // Random direction and speed; altitude is balanced (no clumping).
        const direction: 1 | -1 = Math.random() > 0.5 ? 1 : -1;
        const speed = 0.6 + Math.random() * 0.9;
        const y = this.planeYDeck.nextValue(50, h * 0.5 + 50);

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

        // Add to the plane layer (always rendered above clouds).
        this.planeLayer?.addChild(sprite);

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
     * Spawns a procedurally generated cloud entering from the left edge.
     * The cloud graphics are generated once and reused for its lifetime.
     */
    private _spawnCloud(): void {
        if (!this.app) {
            return;
        }

        const { width, height } = this.app.screen;

        // Generate the cloud shape and convert it to a centered Graphics.
        const data = generateCloud(width, height);
        const gfx = cloudToGraphics(data);
        const halfW = gfx.width / 2;

        // Enter from the left edge, fully off-screen.
        gfx.x = -halfW;

        // Balanced random altitude in the upper portion of the screen.
        gfx.y = this.cloudYDeck.nextValue(40, 40 + height * 0.5);

        // Add to the cloud layer (rendered beneath planes).
        this.cloudLayer?.addChild(gfx);

        this.clouds.push({
            gfx,
            halfW,
        });

        // The next cloud is scheduled by the spawn logic in `update()`.
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
    update(deltaTime: number): void {
        if (!this.app || !this.ready) return;

        const now = performance.now();
        const w = this.app.screen.width;

        // ---- Spawn planes (every PLANE_SPAWN_INTERVAL ms) ---------------
        // Timers are driven by rAF delta time — NOT by setTimeout /
        // setInterval. Browser timers keep firing while the window is
        // minimized, which queues up a burst of clouds/planes that appear
        // at once on restore. rAF pauses when hidden, so no spawns
        // accumulate in the background. The delta clamp also prevents a
        // huge single-frame jump (right after restore) from firing all
        // queued spawns at once.
        const frameDelta = Math.min(deltaTime, 250);

        this.planeSpawnTimer += frameDelta;
        if (this.planeSpawnTimer >= PLANE_SPAWN_INTERVAL) {
            this._trySpawn();
            this.planeSpawnTimer = 0;
        }

        // ---- Spawn clouds (every 15–20 s) -------------------------------
        this.cloudSpawnTimer += frameDelta;
        if (this.cloudSpawnTimer >= this.cloudSpawnDelay) {
            this._spawnCloud();
            this.cloudSpawnTimer = 0;
            this.cloudSpawnDelay =
                CLOUD_SPAWN_DELAY_MIN +
                Math.random() * (CLOUD_SPAWN_DELAY_MAX - CLOUD_SPAWN_DELAY_MIN);
        }

        // ---- Move clouds (slow drift to the right) ----------------------
        for (let i = this.clouds.length - 1; i >= 0; i--) {
            const cloud = this.clouds[i];
            cloud.gfx.x += CLOUD_SPEED;

            // Remove once fully off-screen right.
            if (cloud.gfx.x - cloud.halfW > w) {
                this.cloudLayer?.removeChild(cloud.gfx);
                cloud.gfx.destroy();
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
                this.planeLayer?.removeChild(plane.sprite);
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
        this.disposed = true;
        this.stop();

        // Destroy Pixi and all its children.
        // IMPORTANT: pass `false` for removeView — passing `true` would
        // detach the <canvas> from the DOM, leaving the next screen
        // with a black panel.
        if (this.app) {
            this.app.destroy(false, { children: true });
            this.app = null;
        }

        // Reset state.
        this.cloudLayer = null;
        this.planeLayer = null;
        this.planes = [];
        this.clouds = [];
        this.allFrames = [];
        this.ready = false;
    }
}
