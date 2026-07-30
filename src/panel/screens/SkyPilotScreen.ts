import { Application, Sprite, Texture } from 'pixi.js';
import { BaseScreen, ScreenConfig } from './BaseScreen';

function assetsUrl(relativePath: string): string {
    const base = (window as any).__ASSETS_BASE_URI__ || '';
    return `${base}/${relativePath}`.replace(/\/+/g, '/');
}

const PLANE_COLORS = ['Blue', 'Green', 'Red', 'Yellow'];
const FRAME_INTERVAL = 80;

interface PlaneFrames {
    textures: Texture[];
}

interface PlaneState {
    sprite: Sprite;
    frames: PlaneFrames;
    x: number;
    speed: number;
    frameIndex: number;
    lastFrameTime: number;
    direction: 1 | -1;
}

export class SkyPilotScreen extends BaseScreen {
    private app: Application | null = null;
    private bg: Sprite | null = null;
    private planes: PlaneState[] = [];
    private allFrames: PlaneFrames[] = [];
    private ready: boolean = false;
    private spawnInterval: ReturnType<typeof setInterval> | null = null;
    private bgAspect: number = 1;

    constructor(canvas: HTMLCanvasElement, config: ScreenConfig) {
        super(canvas, config);
    }

    async start(): Promise<void> {
        await this._initPixi();
        super.start();
    }

    private async _initPixi(): Promise<void> {
        if (this.app) {
            this.stop();
            this.app.destroy(true, { children: true });
            this.app = null;
            this.bg = null;
            this.planes = [];
            this.allFrames = [];
        }

        this.app = new Application();
        await this.app.init({
            canvas: this.canvas,
            width: this.canvas.width,
            height: this.canvas.height,
            backgroundColor: 0x0f0c29,
            preference: 'canvas',
        });

        // Load skybox
        const skyboxUrl = assetsUrl('screens/sky-pilot/skybox-day.png');
        try {
            const img = await this._loadImage(skyboxUrl);
            this.bgAspect = img.naturalWidth / img.naturalHeight;
            const texture = Texture.from(img);
            this.bg = new Sprite(texture);
            this._fitBg(this.app.screen.width, this.app.screen.height);
            this.app.stage.addChild(this.bg);
        } catch (err) {
            console.error('[SkyPilot] Skybox error:', err);
        }

        // Load all plane colors (each color = 3 propeller frames)
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
            if (ok && textures.length === 3) {
                this.allFrames.push({ textures });
            }
        }

        this.ready = this.allFrames.length > 0;
        console.log(`[SkyPilot] Loaded ${this.allFrames.length} plane variants`);

        // Start spawning
        this.spawnInterval = setInterval(() => this._trySpawn(), 2000);
        setTimeout(() => this._trySpawn(), 300);
    }

    private _fitBg(viewW: number, viewH: number): void {
        if (!this.bg) return;
        // CSS background-size: cover logic
        // Use the original texture size as reference (not the scaled sprite size)
        const scaleW = viewW / this.bg.texture.width;
        const scaleH = viewH / this.bg.texture.height;
        const scale = Math.max(scaleW, scaleH);
        this.bg.scale.set(scale);
        this.bg.x = 0;
        this.bg.y = 0;
    }

    private _loadImage(url: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load: ' + url));
            img.src = url;
        });
    }

    private _trySpawn(): void {
        if (!this.app || !this.ready) return;
        if (this.planes.length >= 1) return;

        const w = this.app.screen.width;
        const h = this.app.screen.height;
        const direction: 1 | -1 = Math.random() > 0.5 ? 1 : -1;
        const speed = 0.6 + Math.random() * 0.9;
        const y = 50 + Math.random() * (h * 0.5);
        const x = direction === 1 ? -100 : w + 100;

        // Pick a random color variant
        const frames = this.allFrames[Math.floor(Math.random() * this.allFrames.length)];

        const sprite = new Sprite(frames.textures[0]);
        sprite.anchor.set(0.5, 0.5);
        sprite.scale.set(0.4);
        sprite.x = x;
        sprite.y = y;

        if (direction === -1) {
            sprite.scale.x = -0.4;
        }

        this.app.stage.addChild(sprite);

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

    // ---- BaseScreen abstract implementations ----

    init(): void {
        // Pixi handles initialization asynchronously via start()
    }

    update(_deltaTime: number): void {
        if (!this.app || !this.ready) return;

        const now = performance.now();
        const w = this.app.screen.width;

        for (let i = this.planes.length - 1; i >= 0; i--) {
            const plane = this.planes[i];

            plane.x += plane.speed * plane.direction;
            plane.sprite.x = plane.x;

            if (now - plane.lastFrameTime > FRAME_INTERVAL) {
                plane.frameIndex = (plane.frameIndex + 1) % plane.frames.textures.length;
                plane.sprite.texture = plane.frames.textures[plane.frameIndex];
                plane.lastFrameTime = now;
            }

            if ((plane.direction === 1 && plane.x > w + 150) ||
                (plane.direction === -1 && plane.x < -150)) {
                this.app.stage.removeChild(plane.sprite);
                plane.sprite.destroy();
                this.planes.splice(i, 1);
            }
        }
    }

    render(): void {
        if (this.app) {
            this.app.renderer.render({ container: this.app.stage });
        }
    }

    resize(width: number, height: number): void {
        this.canvas.width = width;
        this.canvas.height = height;
        if (this.app) {
            this.app.renderer.resize(width, height);
        }
        this._fitBg(width, height);
    }

    dispose(): void {
        this.stop();
        if (this.spawnInterval) {
            clearInterval(this.spawnInterval);
            this.spawnInterval = null;
        }
        if (this.app) {
            this.app.destroy(true, { children: true });
            this.app = null;
        }
        this.bg = null;
        this.planes = [];
        this.allFrames = [];
        this.ready = false;
    }
}
