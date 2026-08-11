/**
 * SkyPilotScreen.ts
 * ---------------------------------------------------------------------------
 * A pure Canvas2D scene featuring:
 *   1. A light-blue sky background
 *   2. Procedurally generated drifting clouds
 *   3. Colorful airplanes (Blue/Green/Red/Yellow) that fly across the screen
 *
 * Clouds are generated with overlapping circles — each cloud is a group of
 * circles with a flat bottom, drifting gently from left to right. The
 * generation logic mirrors the classic "fluff cloud" algorithm: a big center
 * circle + descending side circles + end circles that fill out the bottom.
 * A soft off-white shadow is drawn 6px behind each cloud, then the solid
 * white body on top.
 *
 * Planes use the 12 PNG assets (`assets/screens/sky-pilot/plane{Color}{1..3}.png`).
 * Each color has 3 propeller frames that cycle to animate the spinning prop.
 *
 * Timing rules (per AGENTS.md):
 *   - No setTimeout / setInterval. All spawn/frame timers are driven from
 *     `update(deltaTime)` with an accumulated counter.
 *   - Per-frame delta is clamped to 250ms so a huge frame right after
 *     restoring the window can't fire a burst of planes/clouds.
 *   - Async `start()` guards against `dispose()`.
 *
 * NOTE: Velocities are expressed in px/ms using a 60 fps reference
 * (1 px/frame @ 60fps = 0.06 px/ms).
 * ---------------------------------------------------------------------------
 */

import { BaseScreen, ScreenConfig } from './BaseScreen';
import { BalancedDeck } from '../utils/random';

/**
 * Builds a fully-qualified asset URL from a path relative to `assets/`.
 * Falls back to an empty string if `__ASSETS_BASE_URI__` is not available.
 *
 * @param relativePath - e.g. 'screens/sky-pilot/plane-blue-1.png'
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

/** Available airplane colors (lowercase — used in the kebab-case filenames). */
const PLANE_COLORS = ['blue', 'green', 'red', 'yellow'];

/** Time (ms) between propeller frame swaps → controls prop spin speed. */
const FRAME_INTERVAL = 80;

/** Light-blue background color for the sky (matches the original sample). */
const SKY_COLOR = '#9bd2f8';

/**
 * Conversion factor: 1 px/frame @ 60 fps = 0.06 px/ms.
 * Used to convert the original "per frame" speeds to px/ms.
 */
const PX_PER_MS = 60 / 1000;

/** Fixed horizontal drift speed (px/ms) for ALL clouds. */
const CLOUD_SPEED = 0.2 * PX_PER_MS;

/** Min delay (ms) before spawning the next cloud. */
const CLOUD_SPAWN_DELAY_MIN = 15000;

/** Max delay (ms) before spawning the next cloud. */
const CLOUD_SPAWN_DELAY_MAX = 20000;

/** Solid white color for cloud fill. */
const CLOUD_COLOR = '#ffffff';

/** Soft gray-blue shadow color behind each cloud. */
const CLOUD_SHADOW_COLOR = '#8eb8d6';

/** Shadow offset (px) behind each cloud. */
const CLOUD_SHADOW_OFFSET = 6;

/** Base radius (px) of the cloud's center fluff. */
const CLOUD_BASE_SIZE = 22;

/** Random variation (px) added to the base size → keeps clouds similar. */
const CLOUD_SIZE_VARIATION = 5;

/** Maximum number of planes allowed on screen at the same time. */
const MAX_PLANES = 1;

/** Interval (ms) between plane spawn attempts. */
const PLANE_SPAWN_INTERVAL = 2000;

/** Scale factor for airplane sprites (0.5 = 50% of the original image size). */
const PLANE_SCALE = 0.5;

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** A single "fluff" circle that makes up part of a cloud. */
interface Fluff {
    /** Horizontal center (px), relative to the cloud's origin. */
    x: number;
    /** Vertical center (px), relative to the cloud's origin. */
    y: number;
    /** Circle radius (px). */
    r: number;
}

/** Geometric data for a generated cloud (circles centered at the cloud origin). */
interface CloudData {
    /** Circles composing the cloud. */
    fluffs: Fluff[];
    /** Half of the cloud's total width (px) — used for removal checks. */
    halfW: number;
    /** Bottom edge (flat base line) relative to the cloud origin (px). */
    bottomY: number;
}

/** Runtime state for one active airplane. */
interface PlaneState {
    /** The 3 propeller frames for this plane's color. */
    frames: HTMLImageElement[];
    /** The frame currently being drawn. */
    img: HTMLImageElement;
    /** Current horizontal position (px). */
    x: number;
    /** Current vertical position (px). */
    y: number;
    /** Horizontal movement speed (px/ms). */
    speed: number;
    /** 1 = flying right, -1 = flying left (sprite is flipped). */
    direction: 1 | -1;
    /** Index into `frames` — which prop frame is showing. */
    frameIndex: number;
    /** Accumulated ms since the last prop frame swap (driven by update). */
    frameTimer: number;
    /** On-screen draw width (px). */
    drawW: number;
    /** On-screen draw height (px). */
    drawH: number;
}

/** Runtime state for one drifting cloud. */
interface CloudState {
    /** Horizontal center position (px). */
    x: number;
    /** Vertical center position (px). */
    y: number;
    /** Circles composing the cloud (relative to the cloud origin). */
    fluffs: Fluff[];
    /** Half-width of the cloud — used for removal checks. */
    halfW: number;
    /** Bottom edge (flat base line) relative to the cloud origin (px). */
    bottomY: number;
}

// --------------------------------------------------------------------------
// Cloud generation helpers (mirrors the classic fluff-cloud algorithm)
// --------------------------------------------------------------------------

/**
 * Fixed overlap ratio: two neighbouring circles always overlap by this
 * fraction of their COMBINED radius (r1 + r2). Constant (not random), so
 * the spacing stays perfectly proportional to BOTH circles' sizes — the
 * same natural, stable overlap everywhere.
 */
const OVERLAP_RATIO = 0.05;

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
    // Constant overlap relative to BOTH radii: the centre distance is
    // always (r1 + r2) * (1 - OVERLAP_RATIO). Vertical offset keeps the
    // original descending-chain structure (a = r1 - r2).
    const centreDist = (r1 + r2) * (1 - OVERLAP_RATIO);
    const a = r1 - r2;
    const b = Math.sqrt(Math.max(0, centreDist * centreDist - a * a));
    return { x: prev.x - b, y: prev.y + a, r: r2 };
}

/**
 * Calculates the position of the next smaller circle placed to the RIGHT
 * of a previous one — offset downward and overlapping.
 */
function calcPositionRight(prev: Fluff, r: number): Fluff {
    const r1 = prev.r;
    const r2 = r;
    // Constant overlap relative to BOTH radii: the centre distance is
    // always (r1 + r2) * (1 - OVERLAP_RATIO). Vertical offset keeps the
    // original descending-chain structure (a = r1 - r2).
    const centreDist = (r1 + r2) * (1 - OVERLAP_RATIO);
    const a = r1 - r2;
    const b = Math.sqrt(Math.max(0, centreDist * centreDist - a * a));
    return { x: prev.x + b, y: prev.y + a, r: r2 };
}

/**
 * Generates a cloud as a set of overlapping circles ("fluffs"), centered
 * at the origin (0,0).
 *
 * Algorithm:
 *   1. One big center circle (medium sized).
 *   2. At least 1 pair (up to 3) of smaller circles added alternately
 *      left/right, each slightly lower than the previous (descending chain).
 *   3. Two large end circles fill the bottom-left and bottom-right.
 *   4. Everything is re-centered so the cloud's bounding-box center is (0,0).
 *
 * @returns geometry data (circles + half width) for the generated cloud
 */
function generateCloud(): CloudData {
    // Consistent medium size: base radius + small random variation,
    // so all clouds look similar in scale (never tiny, never huge).
    const bigR = CLOUD_BASE_SIZE + Math.random() * CLOUD_SIZE_VARIATION;

    const fluffs: Fluff[] = [];
    const bigFluff: Fluff = { x: 0, y: 0, r: bigR };

    // Neighbour-radius rule: two adjacent circles may differ by AT MOST 50%
    // of the larger radius → the smaller one is always ≥ 50% of the larger.
    // Left/right chains descend, so each new circle is 50–100% of the previous.
    const nextRadius = (prev: number) => prev * (0.5 + Math.random() * 0.5);

    let prevLeft = bigFluff;
    let prevRight = bigFluff;

    // Always at least one pair of side circles so the cloud has a
    // recognizable fluffy silhouette (never just a single circle).
    const amount = 1 + Math.floor(Math.random() * 2); // 1..3 pairs
    fluffs.push(bigFluff);

    for (let index = 0; index < amount; index += 2) {
        let rL = nextRadius(prevLeft.r);
        let rR = index + 1 < amount ? nextRadius(prevRight.r) : 0;

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

    // Bottom extent (before end circles) — used to size the end circles.
    const y2 = fluffs.reduce((prev, cur) => Math.max(prev, cur.y + cur.r), 0);

    // End circles fill the bottom so the cloud has a full rounded base.
    // Their radius is clamped so the 50% neighbour rule still holds:
    // r must be between 0.5× and 2× the adjacent circle's radius.
    const clampNeighbour = (adjacent: number, desired: number) =>
        Math.min(adjacent * 2, Math.max(adjacent * 0.5, desired));

    const createEndLeft = () => {
        const first = fluffs[0];
        const diam = Math.max(first.r, y2 - first.y);
        const r = clampNeighbour(first.r, diam / 2);
        const pos = calcPositionLeft(first, r);
        const offset = dist(first.x, first.y, pos.x, pos.y) - (first.r + r);
        fluffs.unshift({ x: pos.x + offset, y: y2 - r, r });
    };

    const createEndRight = () => {
        const last = fluffs[fluffs.length - 1];
        const diam = Math.max(last.r, y2 - last.y);
        const r = clampNeighbour(last.r, diam / 2);
        const pos = calcPositionRight(last, r);
        const offset = dist(last.x, last.y, pos.x, pos.y) - (last.r + r);
        fluffs.push({ x: pos.x - offset, y: y2 - r, r });
    };

    createEndLeft();
    createEndRight();

    // Full extents including the end circles.
    const x1 = fluffs.reduce((prev, cur) => Math.min(prev, cur.x - cur.r), 0);
    const x2 = fluffs.reduce((prev, cur) => Math.max(prev, cur.x + cur.r), 0);
    const y1 = fluffs.reduce((prev, cur) => Math.min(prev, cur.y - cur.r), 0);
    const fullY2 = fluffs.reduce((prev, cur) => Math.max(prev, cur.y + cur.r), 0);

    // Re-center so the cloud's bounding-box center is (0,0).
    const cx = (x1 + x2) / 2;
    const cy = (y1 + fullY2) / 2;
    for (const f of fluffs) {
        f.x -= cx;
        f.y -= cy;
    }

    // Bottom edge (flat base line) relative to the centered origin.
    const bottomY = fullY2 - cy;

    return { fluffs, halfW: (x2 - x1) / 2, bottomY };
}

// --------------------------------------------------------------------------
// SkyPilotScreen
// --------------------------------------------------------------------------

/**
 * SkyPilotScreen — a pure Canvas2D scene.
 *
 * Renders a sky-blue background with procedurally generated drifting
 * clouds and periodically spawning airplanes flying across the screen.
 *
 * Clouds are drawn first, planes on top (cloud layer beneath plane layer).
 */
export class SkyPilotScreen extends BaseScreen {
    /** True once `dispose()` has been called — guards async `start()`. */
    private disposed: boolean = false;

    /** Loaded propeller-frame triples, one per successfully-loaded color. */
    private allFrames: HTMLImageElement[][] = [];

    /** True once all assets are loaded and the scene is ready to animate. */
    private ready: boolean = false;

    /** All currently-active clouds + their state. */
    private clouds: CloudState[] = [];

    /** All currently-active airplanes + their state. */
    private planes: PlaneState[] = [];

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
     * Entry point. Loads the plane assets and then starts the BaseScreen
     * animation loop (which calls `init()` and drives `update()`/`render()`).
     */
    async start(): Promise<void> {
        this.disposed = false;
        await this._loadAssets();

        // Guard: the screen may have been disposed while we were awaiting
        // asset loading. If so, do NOT start the animation loop.
        if (this.disposed) {
            return;
        }

        super.start();
    }

    /**
     * Loads all plane propeller frames (12 PNGs total: 4 colors × 3 frames)
     * via HTMLImageElement. A color is registered only if all 3 of its
     * frames load successfully.
     */
    private async _loadAssets(): Promise<void> {
        for (const color of PLANE_COLORS) {
            const frames: HTMLImageElement[] = [];
            let ok = true;
            for (let i = 1; i <= 3; i++) {
                try {
                    const url = assetsUrl(`screens/sky-pilot/plane-${color}-${i}.png`);
                    const img = await this._loadImage(url);
                    frames.push(img);
                } catch (err) {
                    console.error(`[SkyPilot] Failed to load plane-${color}-${i}.png`, err);
                    ok = false;
                    break;
                }
            }
            // Bail out if the screen was disposed while assets were loading.
            if (this.disposed) {
                return;
            }
            // Only register the color if all 3 frames loaded successfully.
            if (ok && frames.length === 3) {
                this.allFrames.push(frames);
            }
        }

        // The scene is ready only if at least one plane variant is available.
        this.ready = this.allFrames.length > 0;
        console.log(`[SkyPilot] Loaded ${this.allFrames.length} plane variants`);
    }

    /**
     * Loads an image via an HTMLImageElement and resolves once it has
     * finished loading.
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
     * One-time setup. Seeds the spawn timers so the first plane appears
     * almost immediately and the first cloud after a short warm-up.
     *
     * Spawn logic is driven by the requestAnimationFrame loop in
     * `update()` using accumulated delta time — NOT by setTimeout /
     * setInterval. Browser timers keep firing while the window is
     * minimized, which would queue up a burst of clouds/planes that
     * all appear at once on restore. rAF pauses when hidden, so no
     * spawns accumulate in the background.
     */
    init(): void {
        this.clouds = [];
        this.planes = [];

        // First plane spawns almost immediately.
        this.planeSpawnTimer = PLANE_SPAWN_INTERVAL - 300;

        // First cloud spawns after a short warm-up delay.
        this.cloudSpawnTimer = 0;
        this.cloudSpawnDelay = 300;
    }

    /**
     * Attempts to spawn a single airplane.
     * No-op if the scene isn't ready or the max plane count is already reached.
     *
     * The plane starts off-screen (left or right, chosen randomly), enters
     * at a random altitude, and exits on the opposite side.
     */
    private _trySpawnPlane(): void {
        if (!this.ready) {
            return;
        }
        if (this.planes.length >= MAX_PLANES) {
            return;
        }

        const w = this.canvas.width;
        const h = this.canvas.height;

        // Random direction and speed; altitude is balanced (no clumping).
        // Speed is converted from px/frame (original) to px/ms.
        const direction: 1 | -1 = Math.random() > 0.5 ? 1 : -1;
        const speed = (0.6 + Math.random() * 0.9) * PX_PER_MS;
        const y = this.planeYDeck.nextValue(50, h * 0.5 + 50);

        // Start fully off-screen.
        const x = direction === 1 ? -100 : w + 100;

        // Pick a random color variant.
        const frames = this.allFrames[Math.floor(Math.random() * this.allFrames.length)];
        const img = frames[0];
        const drawW = img.width * PLANE_SCALE;
        const drawH = img.height * PLANE_SCALE;

        this.planes.push({
            frames,
            img,
            x,
            y,
            speed,
            direction,
            frameIndex: 0,
            frameTimer: 0,
            drawW,
            drawH,
        });
    }

    /**
     * Spawns a procedurally generated cloud entering from the left edge.
     * The cloud geometry is generated once and reused for its lifetime.
     */
    private _spawnCloud(): void {
        const h = this.canvas.height;

        // Generate the cloud shape (circles centered at the origin).
        const data = generateCloud();

        // Balanced random altitude in the upper portion of the screen.
        const y = this.cloudYDeck.nextValue(40, 40 + h * 0.5);

        // Enter from the left edge, fully off-screen.
        this.clouds.push({
            x: -data.halfW,
            y,
            fluffs: data.fluffs,
            halfW: data.halfW,
            bottomY: data.bottomY,
        });
    }

    /**
     * Called every frame by the BaseScreen animation loop.
     * Advances clouds and planes, animates propeller frames,
     * and removes objects that have left the screen.
     *
     * All timing is driven from this rAF-based method — no setTimeout /
     * setInterval. The delta clamp also prevents a huge single-frame jump
     * (right after restore) from firing all queued spawns at once.
     */
    update(deltaTime: number): void {
        if (!this.ready) {
            return;
        }

        // Clamp: a huge frame right after restoring the window could
        // otherwise fire all queued spawns at once when minimized.
        const frameDelta = Math.min(deltaTime, 250);
        const w = this.canvas.width;

        // ---- Spawn planes (every PLANE_SPAWN_INTERVAL ms) ---------------
        this.planeSpawnTimer += frameDelta;
        if (this.planeSpawnTimer >= PLANE_SPAWN_INTERVAL) {
            this._trySpawnPlane();
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
            cloud.x += CLOUD_SPEED * frameDelta;

            // Remove once fully off-screen right.
            if (cloud.x - cloud.halfW > w) {
                this.clouds.splice(i, 1);
            }
        }

        // ---- Move planes & animate their propellers ---------------------
        for (let i = this.planes.length - 1; i >= 0; i--) {
            const plane = this.planes[i];

            // Advance horizontal position.
            plane.x += plane.speed * plane.direction * frameDelta;

            // Cycle propeller frames every FRAME_INTERVAL ms (driven by the
            // accumulated timer — pauses correctly in the background).
            plane.frameTimer += frameDelta;
            if (plane.frameTimer >= FRAME_INTERVAL) {
                plane.frameTimer -= FRAME_INTERVAL;
                plane.frameIndex = (plane.frameIndex + 1) % plane.frames.length;
                plane.img = plane.frames[plane.frameIndex];
            }

            // Remove the plane once it has fully exited the screen.
            if ((plane.direction === 1 && plane.x > w + 150) ||
                (plane.direction === -1 && plane.x < -150)) {
                this.planes.splice(i, 1);
            }
        }
    }

    /**
     * Fills one cloud shape as a SINGLE unified path — all circles plus a
     * polygon that closes across the flat bottom base. A solid uniform fill
     * with no gaps between the overlapping circles.
     *
     * @param ctx      - the canvas 2D context
     * @param fluffs   - the cloud's circles (relative to the cloud origin)
     * @param bottomY  - the flat bottom edge (relative to the cloud origin)
     * @param color    - fill color
     */
    private _fillCloudShape(
        ctx: CanvasRenderingContext2D,
        fluffs: Fluff[],
        bottomY: number,
        color: string,
    ): void {
        ctx.beginPath();
        for (const f of fluffs) {
            ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        }
        // Close across the flat bottom base.
        ctx.moveTo(fluffs[0].x, bottomY);
        for (const f of fluffs) {
            ctx.lineTo(f.x, f.y);
        }
        ctx.lineTo(fluffs[fluffs.length - 1].x, bottomY);
        ctx.closePath();

        ctx.fillStyle = color;
        ctx.fill();
    }

    /**
     * Draws one cloud: a soft gray-blue shadow drawn slightly offset
     * behind a solid white body. Both passes use the same unified shape.
     */
    private _drawCloud(ctx: CanvasRenderingContext2D, cloud: CloudState): void {
        // 1) Shadow pass.
        ctx.save();
        ctx.translate(cloud.x + CLOUD_SHADOW_OFFSET, cloud.y + CLOUD_SHADOW_OFFSET);
        this._fillCloudShape(ctx, cloud.fluffs, cloud.bottomY, CLOUD_SHADOW_COLOR);
        ctx.restore();

        // 2) Solid white body on top.
        ctx.save();
        ctx.translate(cloud.x, cloud.y);
        this._fillCloudShape(ctx, cloud.fluffs, cloud.bottomY, CLOUD_COLOR);
        ctx.restore();
    }

    /**
     * Draws one airplane sprite, flipping horizontally when flying left
     * so the plane always faces the direction it is moving.
     */
    private _drawPlane(ctx: CanvasRenderingContext2D, plane: PlaneState): void {
        ctx.save();
        ctx.translate(plane.x, plane.y);

        // Flip horizontally so the plane faces its movement direction.
        if (plane.direction === -1) {
            ctx.scale(-1, 1);
        }

        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(
            plane.img,
            -plane.drawW / 2,
            -plane.drawH / 2,
            plane.drawW,
            plane.drawH,
        );
        ctx.restore();
    }

    /**
     * Called every frame. Paints the sky, then clouds, then planes
     * (planes always render on top of clouds).
     */
    render(): void {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // 1. Sky background.
        ctx.fillStyle = SKY_COLOR;
        ctx.fillRect(0, 0, w, h);

        // 2. Clouds (beneath planes).
        for (const cloud of this.clouds) {
            this._drawCloud(ctx, cloud);
        }

        // 3. Planes (on top of clouds).
        for (const plane of this.planes) {
            this._drawPlane(ctx, plane);
        }
    }

    /**
     * Called when the sidebar/canvas is resized.
     * Just resizes the canvas — the scene redraws fully each frame.
     */
    resize(width: number, height: number): void {
        this.canvas.width = width;
        this.canvas.height = height;
    }

    /**
     * Full cleanup: stops the animation loop and resets all state.
     */
    dispose(): void {
        this.disposed = true;
        this.stop();
        this.clouds = [];
        this.planes = [];
        this.allFrames = [];
        this.ready = false;
    }
}
