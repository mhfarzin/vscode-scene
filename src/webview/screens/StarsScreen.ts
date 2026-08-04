/**
 * StarsScreen.ts
 * ---------------------------------------------------------------------------
 * A pure Canvas2D screensaver scene (no Pixi.js).
 *
 * Renders a full night-sky scene:
 *   - Deep gradient sky with drifting nebula clouds
 *   - Soft glowing moon with craters
 *   - 90 tiny twinkling background stars
 *   - 25 vivid five-pointed stars that randomly appear, shine, and fade away
 *   - Random shooting stars (meteors) streaking across the sky with trails
 *   - An animated bird (7-frame sprites) flying from edge to edge
 *
 * Timing rules (per AGENTS.md):
 *   - No setTimeout / setInterval. All spawn timers are driven from
 *     `update(deltaTime)` with an accumulated counter.
 *   - Per-frame delta is clamped to 250ms so a huge frame right after
 *     restoring the window can't fire queued spawns at once.
 * ---------------------------------------------------------------------------
 */

import { BaseScreen, ScreenConfig } from './BaseScreen';

/**
 * Runtime state for a single colored five-point star.
 */
interface Star {
    /** Horizontal position (px). */
    x: number;
    /** Vertical position (px). */
    y: number;
    /** Outer radius of the star's core (px). */
    size: number;
    /** Random rotation (rad) — each star points a slightly different way. */
    rotation: number;
    /** Vivid color as an "R, G, B" string (used in rgb()). */
    color: string;
    /** Random phase offset (0..1) used to vary twinkle timing. */
    brightness: number;
    /** Milliseconds elapsed in the current lifecycle cycle. */
    age: number;
    /** Milliseconds the star stays invisible before appearing. */
    appearDelay: number;
    /** Milliseconds spent fading in. */
    fadeIn: number;
    /** Milliseconds spent at full brightness. */
    shine: number;
    /** Milliseconds spent fading out. */
    fadeOut: number;
}

/** A tiny static background star that only twinkles. */
interface TinyStar {
    x: number;
    y: number;
    size: number;
    /** Random phase offset for the twinkle sine wave. */
    phase: number;
    /** Twinkle speed (rad/s). */
    speed: number;
}

/** A shooting star streaking across the sky. */
interface Meteor {
    x: number;
    y: number;
    /** Horizontal velocity (px/ms). */
    vx: number;
    /** Vertical velocity (px/ms). */
    vy: number;
    /** Trail length in pixels. */
    length: number;
    /** Milliseconds elapsed since spawn. */
    life: number;
    /** Total lifetime in ms before removal. */
    maxLife: number;
    /** Head color as "R, G, B" string. */
    color: string;
    /** Head size radius (px). */
    headSize: number;
}

/** An animated bird flying across the sky (7-frame sprite). */
interface Bird {
    /** Horizontal position (px) — center. */
    x: number;
    /** Vertical position (px) — center. */
    y: number;
    /** Horizontal speed (px/ms). 1 = flying right, -1 = flying left. */
    vx: number;
    /** Draw size (px) — sprite drawn as a square. */
    size: number;
    /** Milliseconds elapsed since spawn. */
    life: number;
    /** Total lifetime in ms before removal. */
    maxLife: number;
    /** Milliseconds since the last frame swap. */
    frameTimer: number;
    /** Index of the current sprite frame (0..6). */
    frameIndex: number;
}

/**
 * Vivid, clearly-visible star color palette "R, G, B" strings.
 * Saturated hues are used on purpose so every star color stands out
 * strongly against the dark sky.
 */
const STAR_COLORS: string[] = [
    '255, 255, 255', // white
    '120, 200, 255', // bright sky blue
    '255, 120, 200', // hot pink
    '255, 215, 0',   // gold
    '0, 230, 255',   // cyan
    '255, 140, 0',   // orange
    '190, 100, 255', // violet
    '255, 90, 80',   // coral red
    '80, 255, 160',  // mint green
];

/** Warm/icy colors used for shooting-star heads and trails. */
const METEOR_COLORS: string[] = [
    '255, 250, 230', // warm white
    '255, 235, 190', // pale gold
    '200, 255, 245', // icy teal
    '255, 210, 220', // pinkish white
];

/** Total number of colored five-point stars on screen. */
const NUM_STARS = 25;

/** Total number of tiny static background stars. */
const NUM_TINY_STARS = 90;

/** Minimum delay between meteors (ms). */
const METEOR_INTERVAL_MIN = 7500;
/** Maximum delay between meteors (ms). */
const METEOR_INTERVAL_MAX = 19500;
/** Meteor minimum horizontal speed (px/ms). */
const METEOR_SPEED_MIN = 0.45;
/** Meteor maximum horizontal speed (px/ms). */
const METEOR_SPEED_MAX = 0.9;
/** Meteor overall opacity (0..1) — lower = hazier/softer. */
const METEOR_ALPHA = 0.6;

/** Minimum delay between birds (ms). */
const BIRD_INTERVAL_MIN = 7000;
/** Maximum delay between birds (ms). */
const BIRD_INTERVAL_MAX = 13000;
/** Milliseconds until the FIRST bird appears after start. */
const BIRD_FIRST_DELAY_MIN = 500;
const BIRD_FIRST_DELAY_MAX = 3000;
/** Bird minimum/maximum horizontal speed (px/ms). */
const BIRD_SPEED_MIN = 0.11;
const BIRD_SPEED_MAX = 0.19;
/** Bird draw size range (px). */
const BIRD_SIZE_MIN = 85;
const BIRD_SIZE_MAX = 134;
/** Milliseconds per bird sprite frame → controls wing-flap speed. */
const BIRD_FRAME_INTERVAL = 75;

/** Number of bird animation frames (assets/screens/stars/1..7.png). */
const BIRD_FRAME_COUNT = 7;

/** Colored star lifecycle timing (ms) — delay, fade-in, shine, fade-out. */
const STAR_APPEAR_DELAY_MAX = 3000;
const STAR_FADE_IN_MIN = 800;
const STAR_FADE_IN_MAX = 2000;
const STAR_SHINE_MIN = 1500;
const STAR_SHINE_MAX = 4000;
const STAR_FADE_OUT_MIN = 800;
const STAR_FADE_OUT_MAX = 2000;

/**
 * Draws a regular 5-pointed star path (not filled) centered at (cx, cy).
 *
 * @param ctx          the canvas 2D context
 * @param cx           center X (px)
 * @param cy           center Y (px)
 * @param rotation     rotation in radians (0 = one spike pointing up)
 * @param outerRadius  distance from center to the outer spikes (px)
 * @param innerRadius  distance from center to the inner notches (px)
 */
function drawStar(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rotation: number,
    outerRadius: number,
    innerRadius: number,
): void {
    const spikes = 5;
    const step = Math.PI / spikes; // angle between two consecutive points
    let angle = -Math.PI / 2 + rotation; // start pointing up (+ rotation)

    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outerRadius : innerRadius;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
        angle += step;
    }
    ctx.closePath();
}

/**
 * StarsScreen — a rich, colorful night sky with stars, moon, nebula,
 * shooting stars, and a passing animated bird.
 */
export class StarsScreen extends BaseScreen {
    /** All active colored five-point stars. */
    private stars: Star[] = [];

    /** Tiny static background stars. */
    private tinyStars: TinyStar[] = [];

    /** Active shooting stars. */
    private meteors: Meteor[] = [];

    /** Active animated birds. */
    private birds: Bird[] = [];

    /** Loaded bird sprite frames (assets/screens/stars/1..7.png). */
    private birdFrames: HTMLImageElement[] = [];

    /** Accumulated time (s) — drives twinkle/nebula/shooting-star animation. */
    private time: number = 0;

    /** Accumulated time (ms) since the last meteor spawn. */
    private meteorTimer: number = 0;

    /** Randomized delay until the next meteor spawn (ms). */
    private nextMeteorIn: number = METEOR_INTERVAL_MIN;

    /** Accumulated time (ms) since the last bird spawn. */
    private birdTimer: number = 0;

    /** Randomized delay until the next bird spawn (ms). */
    private nextBirdIn: number = BIRD_INTERVAL_MIN;

    /** True once the screen has been disposed — guards async loading. */
    private disposed: boolean = false;

    /** Cached vertical sky gradient — rebuilt on resize. */
    private _skyGradient: CanvasGradient | null = null;

    constructor(canvas: HTMLCanvasElement, config: ScreenConfig) {
        super(canvas, config);
    }

    /**
     * Starts the animation loop. Bird sprite frames are loaded first;
     * the loop only starts once they are ready (or after a silent failure).
     */
    async start(): Promise<void> {
        this.disposed = false;
        await this._loadBirdFrames();

        // Guard: the screen may have been disposed while loading.
        if (this.disposed) {
            return;
        }
        super.start();
    }

    /**
     * Loads bird sprite frames `assets/screens/stars/1..7.png` via Image
     * elements. Fails silently so a missing asset never crashes the scene.
     */
    private _loadBirdFrames(): Promise<void> {
        const base = (window as any).__ASSETS_BASE_URI__ || '';
        // Trim ONE trailing slash from base — a naive replace(/\/+/g,'/')
        // would also collapse the `//` protocol in http:// URLs.
        const prefix = `${base.replace(/\/+$/, '')}/screens/stars/`;

        const loads: Promise<void>[] = [];
        for (let i = 1; i <= BIRD_FRAME_COUNT; i++) {
            loads.push(new Promise<void>((resolve) => {
                const img = new Image();
                img.onload = () => {
                    this.birdFrames[i - 1] = img;
                    resolve();
                };
                img.onerror = () => {
                    // Mark slot as failed; the bird simply won't draw that frame.
                    this.birdFrames[i - 1] = null as unknown as HTMLImageElement;
                    resolve();
                };
                img.src = `${prefix}${i}.png`;
            }));
        }

        return Promise.all(loads).then(() => {
            // Keep only successfully loaded frames.
            this.birdFrames = this.birdFrames.filter((f) => f !== null);
        });
    }

    /**
     * Builds the vertical gradient used as the night-sky background.
     */
    private _buildBackground(): void {
        const { width: w, height: h } = this.canvas;
        const grad = this.ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#0a0d24');
        grad.addColorStop(0.5, '#131638');
        grad.addColorStop(1, '#191c4e');
        this._skyGradient = grad;
    }

    /**
     * Creates a new colored five-point star with fully randomized position,
     * rotation, color, size, and lifecycle timings.
     */
    private _makeStar(): Star {
        const star: Star = {
            x: Math.random() * this.canvas.width,
            y: Math.random() * this.canvas.height,
            size: Math.random() * 2 + 2,
            rotation: Math.random() * Math.PI * 2,
            color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
            brightness: Math.random(),
            age: 0,
            appearDelay: Math.random() * STAR_APPEAR_DELAY_MAX,
            fadeIn: STAR_FADE_IN_MIN + Math.random() * (STAR_FADE_IN_MAX - STAR_FADE_IN_MIN),
            shine: STAR_SHINE_MIN + Math.random() * (STAR_SHINE_MAX - STAR_SHINE_MIN),
            fadeOut: STAR_FADE_OUT_MIN + Math.random() * (STAR_FADE_OUT_MAX - STAR_FADE_OUT_MIN),
        };
        return star;
    }

    /**
     * Creates a tiny dim background star.
     */
    private _makeTinyStar(): TinyStar {
        return {
            x: Math.random() * this.canvas.width,
            y: Math.random() * this.canvas.height,
            size: Math.random() * 1.2 + 0.3,
            phase: Math.random() * Math.PI * 2,
            speed: 0.5 + Math.random() * 1.5,
        };
    }

    /**
     * Creates a shooting star streaking mostly horizontally across the sky.
     * It enters from the left edge (flying right) or the right edge
     * (flying left) with only a slight downward drift, at a random
     * mid-to-upper altitude.
     */
    private _spawnMeteor(): void {
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Random direction: 1 = left→right, -1 = right→left.
        const dir = Math.random() > 0.5 ? 1 : -1;

        // Mostly horizontal: only 8°..28° below the horizontal line.
        const angle = Math.PI / 22 + Math.random() * (Math.PI / 9);
        const speed = METEOR_SPEED_MIN + Math.random() * (METEOR_SPEED_MAX - METEOR_SPEED_MIN);

        this.meteors.push({
            // Start fully off-screen at the chosen side.
            x: dir === 1 ? -80 : w + 80,
            // Random altitude in the upper-to-middle part of the sky.
            y: h * 0.12 + Math.random() * h * 0.35,
            vx: dir * Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            length: 60 + Math.random() * 90,
            life: 0,
            // Long enough to fully cross the screen.
            maxLife: 1300 + Math.random() * 900,
            color: METEOR_COLORS[Math.floor(Math.random() * METEOR_COLORS.length)],
            headSize: 1.8 + Math.random() * 1.2,
        });
    }

    /**
     * Spawns a bird entering from the left or right edge, flying straight
     * across to the opposite side. Altitude is random in the upper sky.
     * No-op when no sprite frames were loaded.
     */
    private _spawnBird(): void {
        if (this.birdFrames.length === 0) {
            return;
        }

        const w = this.canvas.width;
        const h = this.canvas.height;

        const dir = Math.random() > 0.5 ? 1 : -1;
        const speed = BIRD_SPEED_MIN + Math.random() * (BIRD_SPEED_MAX - BIRD_SPEED_MIN);
        const size = BIRD_SIZE_MIN + Math.random() * (BIRD_SIZE_MAX - BIRD_SIZE_MIN);

        // Huge maxLife — birds are removed by position (off-screen edge),
        // NOT by lifetime. This guarantees the bird always crosses the full
        // screen even though it may be slow or wide.
        const travelPx = w + size * 2;
        const maxLife = Math.ceil((travelPx / speed) * 1.3) + 500;

        this.birds.push({
            x: dir === 1 ? -size : w + size,
            y: h * 0.15 + Math.random() * h * 0.35,
            vx: dir * speed,
            size,
            life: 0,
            maxLife,
            frameTimer: 0,
            frameIndex: 0,
        });
    }

    /**
     * One-time setup: populates the starfield, tiny stars, and resets the
     * meteor/bird timers. Initial ages are staggered so the screen already
     * shows a mix of hidden/shining/fading stars from the very first frame.
     */
    init(): void {
        this.stars = [];
        this.tinyStars = [];
        this.meteors = [];
        this.birds = [];
        this.meteorTimer = 0;
        this.nextMeteorIn = METEOR_INTERVAL_MIN + Math.random() * (METEOR_INTERVAL_MAX - METEOR_INTERVAL_MIN);
        this.birdTimer = 0;
        // First bird appears soon after start, then the normal cadence.
        this.nextBirdIn = BIRD_FIRST_DELAY_MIN + Math.random() * (BIRD_FIRST_DELAY_MAX - BIRD_FIRST_DELAY_MIN);
        this._buildBackground();

        for (let i = 0; i < NUM_STARS; i++) {
            const star = this._makeStar();

            // Start at a random point in the lifecycle so stars don't all
            // begin invisible at the same moment.
            const cycle = star.appearDelay + star.fadeIn + star.shine + star.fadeOut;
            star.age = Math.random() * cycle;

            this.stars.push(star);
        }

        for (let i = 0; i < NUM_TINY_STARS; i++) {
            this.tinyStars.push(this._makeTinyStar());
        }
    }

    /**
     * Respawns a finished star at a brand-new random position with a new
     * rotation, color, and timings — called when a lifecycle wraps around.
     */
    private _respawn(star: Star): void {
        star.x = Math.random() * this.canvas.width;
        star.y = Math.random() * this.canvas.height;
        star.size = Math.random() * 2 + 2;
        star.rotation = Math.random() * Math.PI * 2;
        star.color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
        star.brightness = Math.random();
        star.age = 0;
        star.appearDelay = Math.random() * STAR_APPEAR_DELAY_MAX;
        star.fadeIn = STAR_FADE_IN_MIN + Math.random() * (STAR_FADE_IN_MAX - STAR_FADE_IN_MIN);
        star.shine = STAR_SHINE_MIN + Math.random() * (STAR_SHINE_MAX - STAR_SHINE_MIN);
        star.fadeOut = STAR_FADE_OUT_MIN + Math.random() * (STAR_FADE_OUT_MAX - STAR_FADE_OUT_MIN);
    }

    /**
     * Per-frame logic: advances time, star lifecycles, meteor motion,
     * and the bird animation/spawn timers.
     *
     * All timing is driven from this rAF-based method — no setTimeout.
     */
    update(deltaTime: number): void {
        // Clamp: a huge frame right after restoring the window must not
        // fast-forward stars or fire a burst of meteors/birds.
        const frameDelta = Math.min(deltaTime, 250);
        this.time += frameDelta / 1000;

        // Colored star lifecycles.
        for (const star of this.stars) {
            star.age += frameDelta;

            const cycle = star.appearDelay + star.fadeIn + star.shine + star.fadeOut;
            if (star.age >= cycle) {
                star.age -= cycle;
                this._respawn(star);
            }
        }

        // Meteor movement.
        for (const meteor of this.meteors) {
            meteor.x += meteor.vx * frameDelta;
            meteor.y += meteor.vy * frameDelta;
            meteor.life += frameDelta;
        }
        this.meteors = this.meteors.filter((m) => m.life < m.maxLife);

        // Meteor spawn timer (accumulated, driven from update).
        this.meteorTimer += frameDelta;
        if (this.meteorTimer >= this.nextMeteorIn) {
            this._spawnMeteor();
            this.meteorTimer = 0;
            this.nextMeteorIn =
                METEOR_INTERVAL_MIN + Math.random() * (METEOR_INTERVAL_MAX - METEOR_INTERVAL_MIN);
        }

        // Bird movement + frame animation.
        const w = this.canvas.width;
        for (let i = this.birds.length - 1; i >= 0; i--) {
            const bird = this.birds[i];
            bird.x += bird.vx * frameDelta;
            bird.life += frameDelta;
            bird.frameTimer += frameDelta;

            // Cycle the sprite frames while flying.
            if (bird.frameTimer >= BIRD_FRAME_INTERVAL) {
                bird.frameTimer -= BIRD_FRAME_INTERVAL;
                bird.frameIndex = (bird.frameIndex + 1) % this.birdFrames.length;
            }

            // Remove only when the bird has FULLY exited the opposite edge.
            // Position-based removal (not lifetime) so the bird always
            // completes its full crossing — never vanishes mid-flight.
            const fullyOff =
                (bird.vx > 0 && bird.x > w + bird.size) ||
                (bird.vx < 0 && bird.x < -bird.size);
            if (fullyOff || bird.life > bird.maxLife) {
                this.birds.splice(i, 1);
            }
        }

        // Bird spawn timer (accumulated, driven from update).
        this.birdTimer += frameDelta;
        if (this.birdTimer >= this.nextBirdIn) {
            this._spawnBird();
            this.birdTimer = 0;
            this.nextBirdIn =
                BIRD_INTERVAL_MIN + Math.random() * (BIRD_INTERVAL_MAX - BIRD_INTERVAL_MIN);
        }
    }

    /**
     * Computes the current opacity (0..1) of a colored star based on its
     * lifecycle: invisible during the delay, fading in, shining, then fading out.
     */
    private _starAlpha(star: Star): number {
        const { appearDelay, fadeIn, shine, fadeOut } = star;
        const t = star.age;

        if (t < appearDelay) {
            return 0;
        }
        if (t < appearDelay + fadeIn) {
            return (t - appearDelay) / fadeIn;
        }
        if (t < appearDelay + fadeIn + shine) {
            return 1;
        }
        return Math.max(0, 1 - (t - appearDelay - fadeIn - shine) / fadeOut);
    }

    /** Draws two very subtle cool-blue nebula clouds that slowly drift. */
    private _drawNebula(ctx: CanvasRenderingContext2D): void {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const driftA = Math.sin(this.time * 0.05) * 15;
        const driftB = Math.cos(this.time * 0.04) * 12;

        // Cool colors only (blue/violet) and much smaller radius so they
        // never read as a big red/pink patch.
        const nebulas = [
            { cx: w * 0.3 + driftA, cy: h * 0.35, r: Math.min(w, h) * 0.28, color: 'rgba(88, 96, 220, 0.09)' },
            { cx: w * 0.7 + driftB, cy: h * 0.5, r: Math.min(w, h) * 0.22, color: 'rgba(55, 110, 220, 0.07)' },
        ];

        for (const neb of nebulas) {
            const grad = ctx.createRadialGradient(neb.cx, neb.cy, 0, neb.cx, neb.cy, neb.r);
            grad.addColorStop(0, neb.color);
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        }
    }

    /** Draws the soft glowing moon with subtle craters. */
    private _drawMoon(ctx: CanvasRenderingContext2D): void {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const cx = w * 0.82;
        const cy = h * 0.16;
        const r = Math.min(w, h) * 0.085;

        // Outer glow.
        const glow = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 4.2);
        glow.addColorStop(0, 'rgba(255, 246, 220, 0.4)');
        glow.addColorStop(1, 'rgba(255, 246, 220, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);

        // Moon disc.
        ctx.fillStyle = '#f6f1de';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Subtle craters.
        ctx.fillStyle = 'rgba(205, 195, 165, 0.35)';
        ctx.beginPath();
        ctx.arc(cx - r * 0.32, cy - r * 0.2, r * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + r * 0.28, cy + r * 0.32, r * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + r * 0.08, cy - r * 0.42, r * 0.09, 0, Math.PI * 2);
        ctx.fill();
    }

    /** Draws one shooting star with a gradient trail and bright head. */
    private _drawMeteor(ctx: CanvasRenderingContext2D, meteor: Meteor): void {
        const t = meteor.life / meteor.maxLife;

        // Fade in quickly, fade out near the end of its life.
        // METEOR_ALPHA makes the whole meteor softer/hazier.
        const fadeIn = Math.min(1, meteor.life / 180);
        const fadeOut = t > 0.65 ? Math.max(0, 1 - (t - 0.65) / 0.35) : 1;
        const alpha = fadeIn * fadeOut * METEOR_ALPHA;
        if (alpha <= 0) {
            return;
        }

        // Tail extends backwards opposite to the velocity direction.
        const tailLen = meteor.length;
        const tailX = meteor.x - (meteor.vx > 0 ? 1 : -1) * tailLen;
        const tailY = meteor.y - (meteor.vy > 0 ? 1 : -1) * tailLen;

        const grad = ctx.createLinearGradient(tailX, tailY, meteor.x, meteor.y);
        grad.addColorStop(0, `rgba(${meteor.color}, 0)`);
        grad.addColorStop(1, `rgba(${meteor.color}, ${alpha})`);

        ctx.globalAlpha = 1;
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(meteor.x, meteor.y);
        ctx.stroke();

        // Bright glowing head.
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgb(${meteor.color})`;
        ctx.shadowColor = `rgb(${meteor.color})`;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(meteor.x, meteor.y, meteor.headSize, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * Draws one bird sprite at its current position, flipping horizontally
     * when flying left so the animation always faces the movement direction.
     */
    private _drawBird(ctx: CanvasRenderingContext2D, bird: Bird): void {
        const frame = this.birdFrames[bird.frameIndex];
        if (!frame) {
            return;
        }

        const s = bird.size;

        ctx.save();
        ctx.globalAlpha = 1; // fully visible — no fade, per user request
        // IMPORTANT: clear any leftover shadow from stars/meteors — a
        // lingering colored shadow (e.g. orange) would glow around the bird.
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        ctx.translate(bird.x, bird.y);

        // The sprite asset shows the bird's HEAD on the LEFT and TAIL on the
        // RIGHT (facing left). So:
        //   - Flying LEFT  (vx < 0): sprite already faces left → no flip.
        //   - Flying RIGHT (vx > 0): flip horizontally so the head leads.
        if (bird.vx > 0) {
            ctx.scale(-1, 1);
        }
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(frame, -s / 2, -s / 2, s, s);
        ctx.restore();
    }

    /**
     * Per-frame drawing: paints the night sky layer by layer.
     */
    render(): void {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // 1. Gradient sky.
        if (this._skyGradient) {
            ctx.fillStyle = this._skyGradient;
        } else {
            ctx.fillStyle = '#0a0d24';
        }
        ctx.fillRect(0, 0, w, h);

        // 2. Nebula clouds.
        this._drawNebula(ctx);

        // 3. Glowing moon.
        this._drawMoon(ctx);

        // 4. Tiny twinkling background stars.
        for (const s of this.tinyStars) {
            const wave = 0.5 + 0.5 * Math.sin(this.time * s.speed + s.phase);
            ctx.globalAlpha = 0.15 + 0.35 * wave;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fill();
        }

        // 5. Colored five-point stars (glow pass, then core pass).
        for (const star of this.stars) {
            const alpha = this._starAlpha(star);
            if (alpha <= 0) {
                continue;
            }
            ctx.globalAlpha = alpha * 0.22;
            ctx.fillStyle = `rgb(${star.color})`;
            drawStar(ctx, star.x, star.y, star.rotation, star.size * 4, star.size * 4 * 0.45);
            ctx.fill();
        }

        for (const star of this.stars) {
            let alpha = this._starAlpha(star);
            if (alpha <= 0) {
                continue;
            }

            // Twinkle shimmer layered on top of the lifecycle alpha.
            const twinkle = 0.75 + 0.25 * Math.sin(this.time * 3 + star.brightness * 10);
            alpha = Math.max(0, Math.min(1, alpha * twinkle));

            ctx.globalAlpha = alpha;
            ctx.fillStyle = `rgb(${star.color})`;
            ctx.shadowColor = `rgb(${star.color})`;
            ctx.shadowBlur = star.size * 2;
            drawStar(ctx, star.x, star.y, star.rotation, star.size, star.size * 0.4);
            ctx.fill();
        }

        // 6. Shooting stars on top.
        for (const meteor of this.meteors) {
            this._drawMeteor(ctx, meteor);
        }

        // 7. Animated birds flying across the sky.
        for (const bird of this.birds) {
            this._drawBird(ctx, bird);
        }

        // Reset state so subsequent frames start clean.
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    }

    /**
     * Resizes the canvas and keeps the scene continuous.
     *
     * IMPORTANT: we intentionally do NOT call `init()` here. Re-seeding the
     * whole scene on a resize makes everything visibly jump/restart (VS Code
     * fires a resize shortly after the webview loads, which looked like the
     * screen "refreshing from the start"). SkyPilot does not have this
     * because its `init()` is a no-op. Instead we only rebuild the gradient
     * and keep existing objects inside the new bounds.
     */
    resize(width: number, height: number): void {
        this.canvas.width = width;
        this.canvas.height = height;
        this._buildBackground();

        // Keep existing colored stars inside the bounds — no full re-seed.
        // Out-of-bounds ones simply respawn naturally via their lifecycle.
        for (const star of this.stars) {
            if (star.x > width) {
                star.x = Math.random() * width;
            }
            if (star.y > height) {
                star.y = Math.random() * height;
            }
        }
        // Clamp birds/meteors that ended up off-screen after a shrink.
        for (const bird of this.birds) {
            if (bird.x > width + bird.size) {
                bird.x = width + bird.size;
            }
            if (bird.x < -bird.size) {
                bird.x = -bird.size;
            }
        }
        for (const meteor of this.meteors) {
            if (meteor.x > width + 80) {
                meteor.x = width + 80;
            }
            if (meteor.x < -80) {
                meteor.x = -80;
            }
        }
    }

    /**
     * Stops the animation loop and clears all scene state.
     */
    dispose(): void {
        this.disposed = true;
        this.stop();
        this.stars = [];
        this.tinyStars = [];
        this.meteors = [];
        this.birds = [];
        this.birdFrames = [];
        this._skyGradient = null;
    }
}
