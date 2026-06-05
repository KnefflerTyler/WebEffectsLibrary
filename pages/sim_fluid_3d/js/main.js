/**
 * main.js — bootstrap for the 3D fluid simulation.
 *
 * Wires together:
 *   FluidSim3D   (CPU Navier-Stokes solver)
 *   Renderer3D   (WebGL2 ray-march volume renderer)
 *   PointManager (faucets & drains)
 *   InputHandler (mouse / touch / keyboard)
 *   Config       (persistent settings + UI panel)
 */

import { FluidSim3D }   from './FluidSim.js';
import { Renderer3D }   from './Renderer3D.js';
import { PointManager } from './PointManager.js';
import { InputHandler } from './InputHandler.js';
import { CFG, THEME_IDX, bindSettings } from './Config.js';

// ── Grid size ─────────────────────────────────────────────────────────────
// N=32 gives a 32x32x32 interior grid (fast enough for 60fps on CPU).
const N = 32;

// ── Simulation ────────────────────────────────────────────────────────────
const sim    = new FluidSim3D(N, 6);
const points = new PointManager(N);

// ── Renderer ──────────────────────────────────────────────────────────────
const canvas  = document.getElementById('canvas');
const overlay = document.getElementById('overlay');
const octx    = overlay.getContext('2d');

const renderer = new Renderer3D(canvas);
renderer.init(N);

function resizeAll() {
    renderer.resize();
    overlay.width  = window.innerWidth;
    overlay.height = window.innerHeight;
}
resizeAll();
window.addEventListener('resize', resizeAll);

// ── Brush accumulator buffers (drained each frame) ────────────────────────
const S  = N + 2;
const SS = S * S;
const brushDens = new Float32Array(S * S * S);
const brushU    = new Float32Array(S * S * S);
const brushV    = new Float32Array(S * S * S);
const brushW    = new Float32Array(S * S * S);

function flushBrush() {
    for (let idx = 0; idx < brushDens.length; idx++) {
        sim.densPrev[idx] += brushDens[idx];
        sim.uPrev[idx]    += brushU[idx];
        sim.vPrev[idx]    += brushV[idx];
        sim.wPrev[idx]    += brushW[idx];
    }
    brushDens.fill(0); brushU.fill(0); brushV.fill(0); brushW.fill(0);
}

// ── Gravity ───────────────────────────────────────────────────────────────
function applyGravity(dt) {
    if (!CFG.gravity) return;
    const force = CFG.gravStrength * dt;
    for (let k = 1; k <= N; k++) {
        const kBase = k * SS;
        for (let j = 1; j <= N; j++) {
            let idx = 1 + j * S + kBase;
            for (let i = 1; i <= N; i++, idx++) {
                if (sim.dens[idx] > 0.005)
                    sim.vPrev[idx] -= force * Math.min(sim.dens[idx], 1.5);
            }
        }
    }
}

// ── Input callbacks ───────────────────────────────────────────────────────
const BRUSH_RADIUS = 2;

const input = new InputHandler(canvas, {

    onPaint(sx, sy, dvx, dvy) {
        const g = renderer.unprojectToGrid(sx, sy);
        if (!g) return;
        const vel = renderer.screenDeltaToWorldVelocity(dvx, dvy);
        const r   = CFG.brushSize;
        const st  = CFG.brushStrength;
        const vs  = 4;
        for (let dz = -r; dz <= r; dz++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (dx*dx + dy*dy + dz*dz > r*r) continue;
                    const nx = g.gx + dx, ny = g.gy + dy, nz = g.gz + dz;
                    if (nx < 1 || nx > N || ny < 1 || ny > N || nz < 1 || nz > N) continue;
                    const falloff = 1 - Math.sqrt(dx*dx + dy*dy + dz*dz) / (r + 1);
                    const idx = nx + S*ny + SS*nz;
                    brushDens[idx] += st  * falloff;
                    brushU[idx]    += vel.vx * vs * falloff;
                    brushV[idx]    += vel.vy * vs * falloff;
                    brushW[idx]    += vel.vz * vs * falloff;
                }
            }
        }
    },

    onPlace(sx, sy) {
        const g = renderer.unprojectToGrid(sx, sy);
        if (!g) return;
        if (input.mode === 'faucet') points.addFaucet(g.gx, g.gy, g.gz);
        else if (input.mode === 'drain') points.addDrain(g.gx, g.gy, g.gz);
    },

    onRemove(sx, sy) {
        const g = renderer.unprojectToGrid(sx, sy);
        if (g) points.removeNearest(g.gx, g.gy, g.gz);
    },

    onOrbit(dAz, dEl) { renderer.orbit(dAz, dEl); },
    onZoom(delta)     { renderer.zoom(delta); },

    onClear() {
        sim.clear();
        points.clear();
        brushDens.fill(0); brushU.fill(0); brushV.fill(0); brushW.fill(0);
    },

    onResetCamera() { renderer.resetCamera(); },
});

// Wire toolbar buttons to input modes
document.querySelectorAll('.mode-btn').forEach(btn =>
    btn.addEventListener('click', () => input.setMode(btn.dataset.mode)));

// ── Settings panel ────────────────────────────────────────────────────────
bindSettings(() => {
    sim.clear();
    points.clear();
});

// ── Main loop ─────────────────────────────────────────────────────────────
const PLACE_ICON_RADIUS = 14; // pixels for overlay icons
let lastTime = performance.now();

function loop(ts) {
    const dt = Math.min((ts - lastTime) * 0.001, 0.033);
    lastTime = ts;

    // 1. Apply forces and source injection
    applyGravity(dt);
    flushBrush();
    points.inject(sim, dt);

    // 2. Advance simulation
    sim.step(CFG.viscosity, CFG.diffusion, dt);

    // 3. Upload density to GPU and ray-march render
    renderer.upload(sim.dens);
    renderer.render(THEME_IDX[CFG.colorTheme] ?? 0);

    // 4. Draw faucet/drain overlay and ghost cursor
    const cursor = renderer.unprojectToGrid(input.cursorScreen.x, input.cursorScreen.y);
    points.draw(
        octx,
        (gx, gy, gz) => renderer.projectToScreen(gx, gy, gz),
        input.mode,
        cursor,
        PLACE_ICON_RADIUS,
    );

    requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
