// VS Code Screensaver - Panel script
/// <reference lib="dom" />

async function main() {
    console.log('panel start 3');
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
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
        const c = ctx!;
        c.fillStyle = '#000';
        c.fillRect(0, 0, canvas.width, canvas.height);

        time += 0.01;

        for (const star of stars) {
            const twinkle = Math.sin(time * 3 + star.brightness * 10) * 0.3 + 0.7;
            c.fillStyle = `rgba(255, 255, 255, ${twinkle})`;
            c.beginPath();
            c.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            c.fill();

            // Slow drift
            star.y -= star.speed * 0.2;
            if (star.y < 0) {
                star.y = canvas.height;
                star.x = Math.random() * canvas.width;
            }
        }

        requestAnimationFrame(animate);
    }

    animate();
}

document.addEventListener('DOMContentLoaded', main);
