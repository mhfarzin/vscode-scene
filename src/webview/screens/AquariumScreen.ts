/**
 * AquariumScreen.ts
 * ---------------------------------------------------------------------------
 * A cheerful animated fish-tank scene (pure Canvas2D) with animated tails.
 *
 * Renders:
 *   - The aquarium background image (`assets/screens/aquarium/background.png`)
 *     tiled to fill the whole canvas. The image is designed to repeat
 *     seamlessly — adjacent tiles line up perfectly on both axes.
 *   - A subtle shimmering light caustic overlay on top of the water
 *   - Exactly 6 cartoon fish sprites (`assets/screens/aquarium/fish-1..6.png`)
 *     swimming around — one of each type, no duplicates. They wander inside
 *     the tank, turn around at the walls, bob up and down, and flip to face
 *     their movement direction.
 *   - ANIMATED TAILS: at load time each sprite is split at its tail neck into
 *     a "body" part and a "tail" part. During render the tail is rotated
 *     around the neck hinge with a sine wave, so every fish wags its tail —
 *     exactly like the original procedural fish.
 *   - Every resident fish periodically blows small bubbles from its own
 *     mouth; the bubbles rise and wobble up to the surface and are sized
 *     proportionally to the fish that blew them.
 *
 * Tail-neck data was measured from the actual PNGs (column-alpha profiles).
 * Each entry is a fraction of the sprite width/height:
 *   fish-1: neck x=0.750 y=0.706
 *   fish-2: neck x=0.767 y=0.428
 *   fish-3: neck x=0.716 y=0.567
 *   fish-4: neck x=0.830 y=0.529
 *   fish-5: neck x=0.723 y=0.498
 *   fish-6: neck x=0.754 y=0.549
 *
 * If a background image fails to load a plain light-blue fill is drawn.
 *
 * Timing rules (per AGENTS.md):
 *   - No setTimeout / setInterval. All spawn timers are driven from
 *     `update(deltaTime)` with an accumulated counter.
 *   - Per-frame delta is clamped to 250ms so a huge frame right after
 *     restoring the window can't fire a burst of bubbles at once.
 *   - Async `start()` guards against `dispose()` (checks the `disposed`
 *     flag after asset loading).
 * ---------------------------------------------------------------------------
 */

import { BaseScreen, ScreenConfig } from './BaseScreen';

/**
 * Builds a fully-qualified asset URL from a path relative to `assets/`.
 * Falls back to an empty string if `__ASSETS_BASE_URI__` is not available.
 *
 * @param relativePath - e.g. 'screens/aquarium/background.png'
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
// Types
// --------------------------------------------------------------------------

/**
 * A loaded fish sprite, pre-split at its tail neck.
 * `img` is the full original sprite; `body` is the left part up to and
 * including the neck column; `tail` is the right part starting at the neck.
 */
interface FishSprite {
    /** Original full sprite image. */
    img: HTMLImageElement;
    /** Body-only canvas (columns 0..neckX). */
    body: HTMLCanvasElement;
    /** Tail-only canvas (columns neckX..end). */
    tail: HTMLCanvasElement;
    /** Full image dimensions (px). */
    w: number;
    h: number;
    /** Neck X in sprite pixels (column where tail begins). */
    neckX: number;
    /** Neck Y in sprite pixels (vertical center of the neck). */
    neckY: number;
}

/** A single swimming fish that lives inside the tank. */
interface Fish {
    x: number;
    y: number;
    /** Horizontal velocity (px/ms). Sign = swimming direction. */
    vx: number;
    /** Vertical wander velocity (px/ms). */
    vy: number;
    /** 1 = facing right, -1 = facing left. */
    facing: 1 | -1;
    /** Base scale unit (px). Sprite size is derived from this. */
    size: number;
    /** The fish sprite assigned to this fish. */
    sprite: FishSprite;
    /** Tail-wiggle radians phase — drives the animated tail. */
    tailPhase: number;
    /** Tail wiggle speed (rad/ms). */
    tailSpeed: number;
    /** Slight body curl phase. */
    bodyPhase: number;
    /** Body curl speed (rad/ms). */
    bodySpeed: number;
    /** Vertical bob offset phase. */
    bobPhase: number;
    /** Bob speed (rad/ms). */
    bobSpeed: number;
    /** Bob amplitude (px). */
    bobAmp: number;
    /** Horizontal wander limits (px), clamped so it turns inside the tank. */
    minX: number;
    maxX: number;
    /** Vertical wander limits (px). */
    minY: number;
    maxY: number;
    /** Accumulated ms since this fish last blew a bubble. */
    bubbleTimer: number;
    /** Random delay (ms) until this fish's next bubble. */
    nextBubbleIn: number;
}

/** A rising air bubble blown by a fish. */
interface Bubble {
    /** Base horizontal position (px) — wobble is applied around it. */
    baseX: number;
    x: number;
    y: number;
    r: number;
    /** Rise speed (px/ms). */
    speed: number;
    wobblePhase: number;
    wobbleSpeed: number;
    /** Wobble side-to-side amplitude (px). */
    wobbleAmp: number;
}

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

/**
 * Number of resident fish swimming in the tank.
 * Matches the number of unique fish sprites (FISH_IMAGE_COUNT) so that
 * each fish sprite appears at most once — no duplicate fish types.
 */
const NUM_FISH = 6;

/** Number of fish sprite images available (`assets/screens/aquarium/fish-N.png`). */
const FISH_IMAGE_COUNT = 6;

/**
 * Global scale for ALL fish sprites.
 * Change this single value to make every fish bigger or smaller.
 * 1 = default size, 2 = double, 0.5 = half.
 */
const FISH_SCALE = 0.7;

/**
 * Height of the "no-swim" zone at the bottom (px) — the sandy floor area
 * visible in the background image. Fish never enter this band.
 * Change this single value to make the forbidden band taller/shorter.
 */
const BOTTOM_NO_SWIM_ZONE = 50;

/** Min delay (ms) between a single fish's bubble spawns. */
const BUBBLE_INTERVAL_MIN = 1800;
/** Max delay (ms) between a single fish's bubble spawns. */
const BUBBLE_INTERVAL_MAX = 4200;

/** Maximum tail swing (radians) — ±MAX_TAIL_SWING around the neck. */
const MAX_TAIL_SWING = 0.32;

/** Pale translucent highlight for bubble shine. */
const BUBBLE_HIGHLIGHT = 'rgba(255, 255, 255, 0.85)';

/** Horizontal distance each fish keeps away from the walls. */
const WALL_MARGIN = 42;

/**
 * Per-sprite tail neck positions as fractions of the sprite width/height.
 * Measured from the actual PNG alpha profiles (see header comment).
 * Indexed by sprite number (1..FISH_IMAGE_COUNT).
 */
const TAIL_NECKS: Record<number, { x: number; y: number }> = {
    1: { x: 0.750, y: 0.706 },
    2: { x: 0.767, y: 0.428 },
    3: { x: 0.716, y: 0.567 },
    4: { x: 0.830, y: 0.529 },
    5: { x: 0.723, y: 0.498 },
    6: { x: 0.754, y: 0.549 },
};

// --------------------------------------------------------------------------
// AquariumScreen
// --------------------------------------------------------------------------

/**
 * AquariumScreen — a calm, playful fish tank using sprite images with
 * animated (wiggling) tails.
 *
 * Lifecycle:
 *   - `start()`   : loads the background + fish sprites (and splits their
 *                   tails), then starts the loop
 *   - `init()`    : seeds the 6 resident fish (one of each sprite type)
 *   - `update()`  : moves fish and bubbles; drives per-fish bubble timers
 *                   and tail phases
 *   - `render()`  : paints the tiled background, caustics, bubbles, fish
 *                   (body + rotated tail)
 *   - `resize()`  : preserves the scene, clamps residents inside new bounds
 *   - `dispose()` : stops the loop, clears everything
 */
export class AquariumScreen extends BaseScreen {
    /** Resident fish. */
    private fish: Fish[] = [];

    /** Active bubbles. */
    private bubbles: Bubble[] = [];

    /** Loaded aquarium background image (tileable). */
    private backgroundImg: HTMLImageElement | null = null;

    /** Loaded fish sprites, split into body + tail. */
    private fishSprites: FishSprite[] = [];

    /** Accumulated scene time (ms). Drives caustics/plant sway. */
    private time: number = 0;

    /** True once disposed — guards async start(). */
    private disposed: boolean = false;

    constructor(canvas: HTMLCanvasElement, config: ScreenConfig) {
        super(canvas, config);
    }

    /**
     * Loads the background and fish sprite assets, then starts the
     * animation loop. Fails silently — missing assets simply fall back.
     */
    async start(): Promise<void> {
        this.disposed = false;
        await this._loadAssets();

        // Guard: the screen may have been disposed while loading.
        if (this.disposed) {
            return;
        }
        super.start();
    }

    /**
     * Loads the aquarium background and the 6 fish sprites via Image
     * elements, then splits each sprite into body + tail parts.
     */
    private async _loadAssets(): Promise<void> {
        // Background (optional — fallback color is used if missing).
        try {
            this.backgroundImg = await this._loadImage('screens/aquarium/background.png');
        } catch (err) {
            console.error('[Aquarium] Failed to load background.png', err);
        }

        // Fish sprites — keep only the ones that loaded successfully.
        const sprites: FishSprite[] = [];
        for (let i = 1; i <= FISH_IMAGE_COUNT; i++) {
            try {
                const img = await this._loadImage(`screens/aquarium/fish-${i}.png`);
                sprites.push(this._splitTail(img, TAIL_NECKS[i] ?? { x: 0.75, y: 0.5 }));
            } catch (err) {
                console.error(`[Aquarium] Failed to load fish-${i}.png`, err);
            }
            // Bail out if the screen was disposed while loading.
            if (this.disposed) {
                return;
            }
        }
        this.fishSprites = sprites;
        console.log(`[Aquarium] Loaded ${sprites.length} fish sprites with animated tails`);
    }

    /**
     * Splits a loaded fish sprite at its tail neck into a body canvas and a
     * tail canvas. The neck is defined by `neck` fractions of the sprite
     * dimensions.
     *
     * @param img  - the full fish sprite
     * @param neck - neck position as fractions (x, y) of the sprite
     * @returns a FishSprite with body/tail parts
     */
    private _splitTail(img: HTMLImageElement, neck: { x: number; y: number }): FishSprite {
        const w = img.width;
        const h = img.height;
        const neckX = Math.max(2, Math.min(w - 2, Math.round(neck.x * w)));
        const neckY = Math.max(1, Math.min(h - 1, Math.round(neck.y * h)));

        // Body: columns 0..neckX (includes the neck column for overlap).
        const body = document.createElement('canvas');
        body.width = neckX;
        body.height = h;
        const bctx = body.getContext('2d')!;
        bctx.drawImage(img, 0, 0, neckX, h, 0, 0, neckX, h);

        // Tail: columns neckX..end (starts exactly at the neck column so it
        // overlaps the body and stays attached at the hinge).
        const tailW = w - neckX;
        const tail = document.createElement('canvas');
        tail.width = tailW;
        tail.height = h;
        const tctx = tail.getContext('2d')!;
        tctx.drawImage(img, neckX, 0, tailW, h, 0, 0, tailW, h);

        return {
            img,
            body,
            tail,
            w,
            h,
            neckX,
            neckY,
        };
    }

    /**
     * Loads an image via an HTMLImageElement and resolves once it has
     * finished loading.
     *
     * @param relativePath - path relative to `assets/`
     * @returns a Promise resolving to the loaded image
     */
    private _loadImage(relativePath: string): Promise<HTMLImageElement> {
        const url = assetsUrl(relativePath);
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load: ' + url));
            img.src = url;
        });
    }

    /** One-time setup: seeds the 6 resident fish. */
    init(): void {
        const w = this.canvas.width;
        const h = this.canvas.height;

        this.fish = [];
        this.bubbles = [];
        this.time = 0;

        // Seed resident fish — staggered phases so the tank is lively at once.
        // Each loaded sprite is used AT MOST ONCE (no duplicate fish types).
        const sprites = [...this.fishSprites];
        // Fisher-Yates shuffle for a random but unique assignment.
        for (let i = sprites.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [sprites[i], sprites[j]] = [sprites[j], sprites[i]];
        }
        for (let i = 0; i < NUM_FISH; i++) {
            const sprite = sprites[i] ?? this._dummySprite();
            this.fish.push(this._makeFish(i / NUM_FISH * Math.PI * 2, sprite));
        }
    }

    /** Creates a resident fish with the given sprite, size, and motion. */
    private _makeFish(phaseOffset: number, sprite: FishSprite): Fish {
        const w = this.canvas.width;
        const h = this.canvas.height;

        const size = (14 + Math.random() * 15) * FISH_SCALE;
        const dir = Math.random() > 0.5 ? 1 : -1;
        const speed = 0.028 + Math.random() * 0.035;

        return {
            x: WALL_MARGIN + size * 2 + Math.random() * (w - WALL_MARGIN * 2 - size * 4),
            y: h * 0.12 + Math.random() * (h - BOTTOM_NO_SWIM_ZONE - h * 0.12 - size * 2),
            // Diagonal-ish wander: mostly horizontal, some vertical drift.
            vx: dir * speed,
            vy: (Math.random() - 0.5) * speed * 0.5,
            facing: dir as 1 | -1,
            size,
            sprite,
            tailPhase: phaseOffset,
            tailSpeed: 0.004 + Math.random() * 0.006,
            bodyPhase: phaseOffset * 1.7,
            bodySpeed: 0.0007 + Math.random() * 0.0009,
            bobPhase: phaseOffset,
            bobSpeed: 0.0008 + Math.random() * 0.0012,
            bobAmp: 1.5 + Math.random() * 2.5,
            minX: WALL_MARGIN + size,
            maxX: w - WALL_MARGIN - size,
            minY: h * 0.08 + size,
            maxY: h - BOTTOM_NO_SWIM_ZONE - size,
            // Each fish has its own staggered bubble cadence.
            bubbleTimer: 0,
            nextBubbleIn: BUBBLE_INTERVAL_MIN + Math.random() * (BUBBLE_INTERVAL_MAX - BUBBLE_INTERVAL_MIN),
        };
    }

    /**
     * Returns a tiny invisible 1×1 sprite used when no fish image loaded.
     * Prevents null-sprite crashes so the tank keeps animating.
     */
    private _dummySprite(): FishSprite {
        const c = document.createElement('canvas');
        c.width = 1;
        c.height = 1;
        const img = new Image();
        img.src = c.toDataURL();
        return {
            img,
            body: c,
            tail: c,
            w: 1,
            h: 1,
            neckX: 0,
            neckY: 0,
        };
    }

    /**
     * Computes the on-screen draw size for a fish given its base `size`
     * scale unit. Width is proportional to `size`; height follows the
     * sprite's natural aspect ratio.
     */
    private _fishSize(sprite: FishSprite, size: number): { w: number; h: number } {
        const aspect = sprite.h / sprite.w;
        const w = size * 2.5;
        return { w, h: w * aspect };
    }

    /**
     * Spawns a small bubble from the given fish's mouth.
     * Bubble radius is proportional to the source fish's size, so bigger
     * fish blow bigger bubbles.
     *
     * @param source - the fish blowing the bubble
     */
    private _spawnBubble(source: Fish): void {
        const { w: spriteW, h: spriteH } = this._fishSize(source.sprite, source.size);

        // Radius scales with the fish's body size.
        const r = source.size * (0.22 + Math.random() * 0.18);

        // Spawn just ahead of the fish's mouth. The sprite faces LEFT by
        // default; when the fish swims right it is mirrored so the head
        // ends up on the right (leading) side.
        const bob = Math.sin(source.bobPhase) * source.bobAmp;
        const spawnX = source.x + source.facing * spriteW * 0.5;
        const spawnY = source.y + bob - spriteH * 0.1;

        this.bubbles.push({
            baseX: spawnX,
            x: spawnX,
            y: spawnY,
            r,
            speed: 0.035 + Math.random() * 0.045,
            wobblePhase: Math.random() * Math.PI * 2,
            wobbleSpeed: 0.003 + Math.random() * 0.004,
            wobbleAmp: 1.5 + Math.random() * 3,
        });
    }

    /**
     * Per-frame logic. All movement and timers are driven from this
     * rAF-based method — no setTimeout / setInterval.
     */
    update(deltaTime: number): void {
        // Clamp: a huge frame right after restoring the window must not
        // fast-forward the scene or fire a burst of spawns.
        const frameDelta = Math.min(deltaTime, 250);
        this.time += frameDelta;

        // ---- Resident fish ----------------------------------------------
        for (const fish of this.fish) {
            fish.x += fish.vx * frameDelta;
            fish.y += fish.vy * frameDelta;

            // Advance wiggle phases (tail + body + bob).
            fish.tailPhase += fish.tailSpeed * frameDelta;
            fish.bodyPhase += fish.bodySpeed * frameDelta;
            fish.bobPhase += fish.bobSpeed * frameDelta;

            // Turn around at the side walls.
            if (fish.x > fish.maxX) {
                fish.x = fish.maxX;
                fish.vx = -Math.abs(fish.vx);
                fish.facing = -1;
            } else if (fish.x < fish.minX) {
                fish.x = fish.minX;
                fish.vx = Math.abs(fish.vx);
                fish.facing = 1;
            }

            // Gentle vertical bounce between the surface band and the bottom.
            if (fish.y > fish.maxY) {
                fish.y = fish.maxY;
                fish.vy = -Math.abs(fish.vy);
            } else if (fish.y < fish.minY) {
                fish.y = fish.minY;
                fish.vy = Math.abs(fish.vy);
            }
        }

        // ---- Bubbles -----------------------------------------------------
        // Every fish blows bubbles from its own mouth, on its own timer.
        for (const fish of this.fish) {
            fish.bubbleTimer += frameDelta;
            if (fish.bubbleTimer >= fish.nextBubbleIn) {
                this._spawnBubble(fish);
                fish.bubbleTimer = 0;
                fish.nextBubbleIn =
                    BUBBLE_INTERVAL_MIN + Math.random() * (BUBBLE_INTERVAL_MAX - BUBBLE_INTERVAL_MIN);
            }
        }

        // Move active bubbles upward.
        for (let i = this.bubbles.length - 1; i >= 0; i--) {
            const bubble = this.bubbles[i];
            bubble.y -= bubble.speed * frameDelta;
            bubble.wobblePhase += bubble.wobbleSpeed * frameDelta;
            bubble.x = bubble.baseX + Math.sin(bubble.wobblePhase) * bubble.wobbleAmp;
            // Slight size growth as it rises.
            bubble.r += 0.0018 * frameDelta;

            // Pop at the surface.
            if (bubble.y < -bubble.r * 2) {
                this.bubbles.splice(i, 1);
            }
        }
    }

    /**
     * Paints the background image with a FIXED scale of 1/2, anchored to
     * the bottom-left corner of the canvas.
     *
     * The whole canvas is first filled with `#B7E3FA` so any area left
     * empty above the tiles shows that color.
     *
     * Falls back to a solid `#B7E3FA` fill while the image is loading
     * (or if it failed to load) so the tank never looks broken.
     */
    private _drawBackground(ctx: CanvasRenderingContext2D): void {
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Base fill: light-blue sky tone.
        ctx.fillStyle = '#B7E3FA';
        ctx.fillRect(0, 0, w, h);

        const img = this.backgroundImg;
        if (!img) {
            // No image loaded yet — the base fill alone is the fallback.
            return;
        }

        // Fixed 1/2 scale — never resize to fit the canvas.
        const scale = 0.5;
        const drawW = img.width * scale;
        const drawH = img.height * scale;

        // Anchor to the bottom-left: the image's bottom edge aligns with
        // the canvas bottom. The area above stays painted #B7E3FA.
        const startY = h - drawH;

        ctx.imageSmoothingEnabled = true;
        // Tile to the right — the image is designed to repeat seamlessly.
        for (let x = 0; x < w; x += drawW) {
            ctx.drawImage(img, x, startY, drawW, drawH);
        }
    }

    /** Draws soft shimmering light caustics over the water. */
    private _drawCaustics(ctx: CanvasRenderingContext2D): void {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const t = this.time;

        // Two drifting light patches that slowly change intensity.
        const caustics = [
            { cx: w * 0.25 + Math.sin(t * 0.0004) * w * 0.1, cy: h * 0.18, r: Math.min(w, h) * 0.3 },
            { cx: w * 0.72 + Math.cos(t * 0.0003) * w * 0.08, cy: h * 0.12, r: Math.min(w, h) * 0.24 },
        ];

        for (let i = 0; i < caustics.length; i++) {
            const c = caustics[i];
            // Keep it subtle so the background image stays clearly visible.
            const pulse = 0.07 + 0.04 * Math.sin(t * 0.0012 + i * 2.4);
            const grad = ctx.createRadialGradient(c.cx, c.cy, 0, c.cx, c.cy, c.r);
            grad.addColorStop(0, `rgba(255, 255, 255, ${pulse})`);
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        }
    }

    /**
     * Draws a fish as a body plus a wiggling tail.
     *
     * The tail is rotated around the neck hinge with a sine wave derived
     * from `tailPhase`, so the fish's tail consistently wags left/right.
     * The sprite faces LEFT by default (head left, tail right), so the
     * whole fish is mirrored horizontally when it swims RIGHT so the head
     * leads the movement direction.
     */
    private _drawBodyAndTail(
        ctx: CanvasRenderingContext2D,
        sprite: FishSprite,
        size: number,
        bobY: number,
        tilt: number,
        facing: 1 | -1,
        tailPhase: number,
        x: number,
        y: number,
    ): void {
        const { w: sw, h: sh } = this._fishSize(sprite, size);

        // Scale factor applied to the sprite dimensions when drawing.
        const drawScale = sw / sprite.w;

        // Draw size of the body and tail parts.
        const bodyW = sprite.body.width * drawScale;
        const bodyH = sprite.body.height * drawScale;
        const tailW = sprite.tail.width * drawScale;
        const tailH = sprite.tail.height * drawScale;

        // Neck point in on-screen (scaled) local coordinates, measured from
        // the CENTER of the full sprite.
        const neckLX = (sprite.neckX - sprite.w / 2) * drawScale;
        const neckLY = (sprite.neckY - sprite.h / 2) * drawScale;
        // Neck point in the tail canvas coordinates (tail starts at neckX).
        const tailNeckY = sprite.neckY * drawScale;

        // Tail rotation angle (rad).
        const angle = Math.sin(tailPhase) * MAX_TAIL_SWING;

        ctx.save();
        ctx.translate(x, y + bobY);
        ctx.rotate(tilt);
        // Sprite faces LEFT by default. When swimming RIGHT (facing = 1)
        // mirror horizontally so the head leads the movement direction.
        if (facing === 1) {
            ctx.scale(-1, 1);
        }
        ctx.imageSmoothingEnabled = true;

        // 1) Body (from 0..neckX, centered so the neck lines up with the
        //    full-sprite geometry).
        ctx.drawImage(sprite.body, -bodyW / 2, -bodyH / 2, bodyW, bodyH);

        // 2) Tail, rotated around the neck hinge. The neck column of the
        //    tail canvas sits at local (neckLX, neckLY).
        ctx.save();
        ctx.translate(neckLX, neckLY);
        ctx.rotate(angle);
        // Draw the tail so its left edge (the neck column) aligns with the
        // hinge: the neck column's vertical center is at tailNeckY.
        ctx.drawImage(sprite.tail, 0, -tailNeckY, tailW, tailH);
        ctx.restore();

        ctx.restore();
    }

    /** Draws one resident fish (body + bob + animated tail). */
    private _drawFish(ctx: CanvasRenderingContext2D, fish: Fish): void {
        const bob = Math.sin(fish.bobPhase) * fish.bobAmp;
        const tilt = Math.sin(fish.bodyPhase) * 0.1;

        this._drawBodyAndTail(
            ctx,
            fish.sprite,
            fish.size,
            bob,
            tilt,
            fish.facing,
            fish.tailPhase,
            fish.x,
            fish.y,
        );
    }

    /** Draws a rising bubble with a glossy highlight. */
    private _drawBubble(ctx: CanvasRenderingContext2D, bubble: Bubble): void {
        ctx.save();
        ctx.strokeStyle = 'rgba(214, 244, 255, 0.55)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(bubble.x, bubble.y, bubble.r, 0, Math.PI * 2);
        ctx.stroke();

        // Glossy highlight.
        ctx.fillStyle = BUBBLE_HIGHLIGHT;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(bubble.x - bubble.r * 0.3, bubble.y - bubble.r * 0.32, bubble.r * 0.25, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    /** Per-frame drawing: paints the tank layer by layer. */
    render(): void {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // 1. Tiled background image (or water-gradient fallback).
        this._drawBackground(ctx);

        // 2. Subtle light caustics over the water.
        this._drawCaustics(ctx);

        // 3. Bubbles (behind fish for depth).
        for (const bubble of this.bubbles) {
            this._drawBubble(ctx, bubble);
        }

        // 4. Resident fish (body + animated tail).
        for (const fish of this.fish) {
            this._drawFish(ctx, fish);
        }

        // Reset state so subsequent frames start clean.
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    }

    /**
     * Resizes the canvas and keeps the scene continuous — no full re-seed.
     * Resident fish are clamped inside the new tank bounds.
     */
    resize(width: number, height: number): void {
        this.canvas.width = width;
        this.canvas.height = height;

        // Re-fit resident fish to the new bounds, preserving their state.
        for (const fish of this.fish) {
            fish.minX = WALL_MARGIN + fish.size;
            fish.maxX = width - WALL_MARGIN - fish.size;
            fish.minY = height * 0.08 + fish.size;
            fish.maxY = height - BOTTOM_NO_SWIM_ZONE - fish.size;

            if (fish.x > fish.maxX) {
                fish.x = fish.maxX;
            }
            if (fish.x < fish.minX) {
                fish.x = fish.minX;
            }
            if (fish.y > fish.maxY) {
                fish.y = fish.maxY;
            }
            if (fish.y < fish.minY) {
                fish.y = fish.minY;
            }
        }
    }

    /** Stops the loop and clears all scene state. */
    dispose(): void {
        this.disposed = true;
        this.stop();
        this.fish = [];
        this.bubbles = [];
        this.backgroundImg = null;
        this.fishSprites = [];
    }
}
