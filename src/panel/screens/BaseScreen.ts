import { ScreenType } from './ScreenType';

export interface ScreenConfig {
    type: ScreenType;
}

export abstract class BaseScreen {
    protected canvas: HTMLCanvasElement;
    protected config: ScreenConfig;
    protected _animFrameId: number | undefined;
    private _ctx: CanvasRenderingContext2D | null = null;

    constructor(canvas: HTMLCanvasElement, config: ScreenConfig) {
        this.canvas = canvas;
        this.config = config;
    }

    /** Lazy getter for 2D canvas context — only used by Canvas2D-based screens */
    protected get ctx(): CanvasRenderingContext2D {
        if (!this._ctx) {
            this._ctx = this.canvas.getContext('2d')!;
        }
        return this._ctx;
    }

    /** Called once when screen is created */
    abstract init(): void;

    /** Called every frame - update logic */
    abstract update(deltaTime: number): void;

    /** Called every frame - draw to canvas */
    abstract render(): void;

    /** Called when canvas/sidebar resizes */
    abstract resize(width: number, height: number): void;

    /** Called once when screen is replaced */
    abstract dispose(): void;

    /** Start the animation loop */
    start(): void | Promise<void> {
        this.init();
        this.loop(0);
    }

    protected loop = (timestamp: number) => {
        const delta = timestamp - (this._lastTimestamp ?? timestamp);
        this._lastTimestamp = timestamp;

        this.update(delta);
        this.render();

        this._animFrameId = requestAnimationFrame(this.loop);
    };

    private _lastTimestamp: number = 0;

    /** Stop the animation loop */
    stop(): void {
        if (this._animFrameId !== undefined) {
            cancelAnimationFrame(this._animFrameId);
            this._animFrameId = undefined;
        }
    }
}
