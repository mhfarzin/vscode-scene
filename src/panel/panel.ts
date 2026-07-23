// VS Code Screensaver - Panel script
// This runs inside the webview
/// <reference lib="dom" />

async function main() {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas) return;

    // Dynamically import PixiJS
    try {
        // Use a CDN or bundle approach - for now, inline a simple animation
        // Since PixiJS is heavy, we'll create a simple canvas-based animation

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        // Stars animation
        const stars: { x: number; y: number; size: number; speed: number; brightness: number }[] = [];
        const numStars = 200;

        for (let i = 0; i < numStars; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 2 + 0.5,
                speed: Math.random() * 0.5 + 0.1,
                brightness: Math.random()
            });
        }

        let time = 0;

        function animate() {
            ctx!.fillStyle = '#000';
            ctx!.fillRect(0, 0, canvas!.width, canvas!.height);

            time += 0.01;

            for (const star of stars) {
                const twinkle = Math.sin(time * 3 + star.brightness * 10) * 0.3 + 0.7;
                ctx!.fillStyle = `rgba(255, 255, 255, ${twinkle})`;
                ctx!.beginPath();
                ctx!.arc(star.x, star.y, star.size, 0, Math.PI * 2);
                ctx!.fill();

                // Slow drift
                star.y -= star.speed * 0.2;
                if (star.y < 0) {
                    star.y = canvas!.height;
                    star.x = Math.random() * canvas!.width;
                }
            }

            requestAnimationFrame(animate);
        }

        animate();
    } catch (err) {
        console.error('Screensaver error:', err);
    }
}

document.addEventListener('DOMContentLoaded', main);
