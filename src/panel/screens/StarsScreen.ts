import { BaseScreen, ScreenConfig } from './BaseScreen';

interface Star {
    x: number;
    y: number;
    size: number;
    speed: number;
    brightness: number;
}

const NUM_STARS = 200;

export class StarsScreen extends BaseScreen {
    private stars: Star[] = [];
    private time: number = 0;

    constructor(canvas: HTMLCanvasElement, config: ScreenConfig) {
        super(canvas, config);
    }

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

    update(_deltaTime: number): void {
        this.time += 0.01;

        for (const star of this.stars) {
            // Slow drift upward
            star.y -= star.speed * 0.2;
            if (star.y < 0) {
                star.y = this.canvas.height;
                star.x = Math.random() * this.canvas.width;
            }
        }
    }

    render(): void {
        const ctx = this.ctx;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        for (const star of this.stars) {
            const twinkle = Math.sin(this.time * 3 + star.brightness * 10) * 0.3 + 0.7;
            ctx.fillStyle = `rgba(255, 255, 255, ${twinkle})`;
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    resize(width: number, height: number): void {
        this.canvas.width = width;
        this.canvas.height = height;
        this.init();
    }

    dispose(): void {
        this.stop();
        this.stars = [];
    }
}
