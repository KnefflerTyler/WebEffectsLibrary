import { initPanelToggle } from '../../../shared/settings.js';

//  Canvas setup 
const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');

//  Config 
const CFG = {
    gravity:      600,   // px/sÂ²
    restitution:  0.55,  // [0..1] bounce factor
    spawnRate:    2.0,   // falling balls per second
    ballMinR:     8,
    ballMaxR:     22,
    numObstacles: 14,
    maxBalls:     150,
};

//  Palette 
const BALL_COLORS = [
    '#4af0ff', '#5b8fff', '#a970ff',
    '#ff6b9d', '#ffcc44', '#44ffaa',
];

//  State 
let obstacles  = [];
let balls      = [];
let spawnAccum = 0;
let prev       = performance.now();

//  Helpers 
function rand(lo, hi) { return lo + Math.random() * (hi - lo); }

function randColor() {
    return BALL_COLORS[Math.floor(Math.random() * BALL_COLORS.length)];
}

//  Resize 
function resize() {
    canvas.width  = innerWidth;
    canvas.height = innerHeight;
    buildObstacles();
}
window.addEventListener('resize', resize);

//  Obstacle placement 
function buildObstacles() {
    obstacles = [];
    balls     = [];

    const W = canvas.width;
    const H = canvas.height;

    // Keep obstacles away from the very top (spawn zone) and bottom edge
    const minY = H * 0.18;
    const maxY = H * 0.87;

    for (let i = 0; i < CFG.numObstacles; i++) {
        for (let attempt = 0; attempt < 300; attempt++) {
            const r = rand(22, 68);
            const x = rand(r + 8, W - r - 8);
            const y = rand(minY, maxY);

            const overlaps = obstacles.some(o => {
                const dx = x - o.x, dy = y - o.y;
                return Math.sqrt(dx * dx + dy * dy) < r + o.r + 18;
            });

            if (!overlaps) {
                obstacles.push({ x, y, r });
                break;
            }
        }
    }
}

//  Spawn a falling ball 
function spawnBall() {
    if (balls.length >= CFG.maxBalls) return;
    const r = rand(CFG.ballMinR, CFG.ballMaxR);
    balls.push({
        x:     rand(r, canvas.width - r),
        y:     -r - 2,
        vx:    rand(-80, 80),
        vy:    0,
        r,
        color: randColor(),
    });
}

//  Physics update 
function update(dt) {
    // Spawn
    spawnAccum += dt;
    const interval = 1 / CFG.spawnRate;
    while (spawnAccum >= interval) {
        spawnAccum -= interval;
        spawnBall();
    }

    const W = canvas.width;
    const H = canvas.height;

    for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i];

        // Gravity
        b.vy += CFG.gravity * dt;

        // Integrate position
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        // Left / right wall collisions
        if (b.x - b.r < 0) {
            b.x  = b.r;
            b.vx = Math.abs(b.vx) * CFG.restitution;
        } else if (b.x + b.r > W) {
            b.x  = W - b.r;
            b.vx = -Math.abs(b.vx) * CFG.restitution;
        }

        // Static obstacle collisions (iterate twice to reduce tunnelling)
        for (let pass = 0; pass < 2; pass++) {
            for (const obs of obstacles) {
                const dx  = b.x - obs.x;
                const dy  = b.y - obs.y;
                const d2  = dx * dx + dy * dy;
                const min = b.r + obs.r;
                if (d2 >= min * min) continue;

                const dist = Math.sqrt(d2) || 0.0001;
                const nx = dx / dist;
                const ny = dy / dist;

                // Push ball to surface
                b.x = obs.x + nx * min;
                b.y = obs.y + ny * min;

                // Reflect velocity along collision normal (only if approaching)
                const dot = b.vx * nx + b.vy * ny;
                if (dot < 0) {
                    b.vx -= (1 + CFG.restitution) * dot * nx;
                    b.vy -= (1 + CFG.restitution) * dot * ny;
                }
            }
        }

        // Despawn once fully below the canvas
        if (b.y - b.r > H) {
            balls.splice(i, 1);
        }
    }
}

//  Draw 
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Obstacles
    for (const obs of obstacles) {
        // Subtle inner fill + rim
        const grad = ctx.createRadialGradient(
            obs.x - obs.r * 0.28, obs.y - obs.r * 0.28, obs.r * 0.1,
            obs.x, obs.y, obs.r
        );
        grad.addColorStop(0, 'rgba(50, 70, 110, 0.95)');
        grad.addColorStop(1, 'rgba(18, 26, 44, 0.95)');

        ctx.beginPath();
        ctx.arc(obs.x, obs.y, obs.r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = 'rgba(80, 140, 220, 0.35)';
        ctx.lineWidth   = 1.5;
        ctx.stroke();
    }

    // Falling balls (glow via shadow)
    for (const b of balls) {
        ctx.shadowBlur  = 14;
        ctx.shadowColor = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.fill();
    }
    ctx.shadowBlur = 0;
}

//  Animation loop 
function loop(ts) {
    requestAnimationFrame(loop);
    const dt = Math.min((ts - prev) / 1000, 0.05); // cap at 50 ms
    prev = ts;
    update(dt);
    draw();
}

//  Settings panel 
initPanelToggle();

document.getElementById('spApply')?.addEventListener('click', () => {
    const get = id => parseFloat(document.getElementById(id)?.value);
    const getInt = id => parseInt(document.getElementById(id)?.value);

    CFG.gravity     = get('cfgGravity')      || CFG.gravity;
    CFG.restitution = (get('cfgRestitution') || 55) / 100;
    CFG.spawnRate   = get('cfgSpawnRate')    || CFG.spawnRate;
    CFG.ballMinR    = get('cfgBallMinR')     || CFG.ballMinR;
    CFG.ballMaxR    = get('cfgBallMaxR')     || CFG.ballMaxR;

    const newCount = getInt('cfgNumObstacles');
    if (!isNaN(newCount) && newCount !== CFG.numObstacles) {
        CFG.numObstacles = newCount;
        buildObstacles(); // resets balls too
    }
});

document.getElementById('cfgRegen')?.addEventListener('click', buildObstacles);

//  Init 
resize();
requestAnimationFrame(loop);
