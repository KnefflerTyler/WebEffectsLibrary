/**
 * simulate.js — offline batch streamline simulation for high-quality renders.
 *
 * Integrates N_PARTICLES streamlines through the analytical potential-flow
 * velocity field, then renders them to an offscreen canvas coloured by local
 * flow speed using the same blue→green→yellow→red ramp as the live simulation.
 *
 * The heavy computation phase is broken into small batches separated by
 * setTimeout(0) so the main thread remains responsive and a progress bar can
 * update between batches.
 *
 * Rendering uses a 5-bucket pass strategy: all path segments in the same
 * speed band are accumulated into one canvas subpath and flushed with a
 * single ctx.stroke(), keeping GPU draw calls to just 5 regardless of how
 * many particles are simulated.
 */
import { TW, TH, TL, VSIM } from './config.js';
import { getVelocity }       from './physics.js';

// ── Simulation constants ───────────────────────────────────────────────────────
export const SIM_N_PARTICLES = 12000;   // streamlines to integrate
const N_STEPS    = 260;                 // max Euler steps per particle
const DT         = 0.030;              // timestep (seconds)
const BATCH_SIZE = 300;                 // particles computed per setTimeout tick

// ── Output canvas dimensions ──────────────────────────────────────────────────
const CW  = 1400;
const CH  = 900;
const PAD = 56;

// ── Colour helpers (mirrors GLSL speed ramp) ──────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }

function speedRGBA(s, alpha) {
    s = Math.max(0, Math.min(2, s));
    let r, g, b;
    if      (s < 0.5) { const t = s * 2;         r = lerp(20, 18,  t); g = lerp(46,  217, t); b = lerp(230, 243, t); }
    else if (s < 1.0) { const t = (s - 0.5) * 2; r = lerp(18, 26,  t); g = lerp(217, 230, t); b = lerp(243, 64,  t); }
    else if (s < 1.5) { const t = (s - 1.0) * 2; r = lerp(26, 243, t); g = lerp(230, 217, t); b = lerp(64,  26,  t); }
    else               { const t = (s - 1.5) * 2; r = lerp(243,243, t); g = lerp(217, 26,  t); b = lerp(26,  20,  t); }
    return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;
}

// Five speed bands — colour buckets for grouped rendering.
// Lower alpha in the first bucket so freestream lines don't dominate.
const BUCKETS = [
    { sMin: 0.00, sMax: 0.38, rgba: speedRGBA(0.19, 0.50) },   // deep blue  (wake / stagnation)
    { sMin: 0.38, sMax: 0.74, rgba: speedRGBA(0.56, 0.52) },   // cyan
    { sMin: 0.74, sMax: 1.12, rgba: speedRGBA(0.93, 0.48) },   // green       (near freestream)
    { sMin: 1.12, sMax: 1.55, rgba: speedRGBA(1.33, 0.55) },   // yellow-gold (acceleration)
    { sMin: 1.55, sMax: 99.0, rgba: speedRGBA(1.82, 0.58) },   // red-orange  (suction peak)
];

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Run the batch simulation then render to an offscreen canvas.
 *
 * @param {{ windMult, objSphere, onProgress, onComplete, onCancel }} opts
 *   windMult   – visual speed multiplier (from UI slider)
 *   objSphere  – { cx, cy, cz, r } | null
 *   onProgress – fn(fraction: 0..1)   called after each batch
 *   onComplete – fn(canvas: HTMLCanvasElement)  called when done
 *   onCancel   – fn()  called if the user cancels
 *
 * @returns {{ cancel: function }}
 */
export function runBatchSimulation({ windMult = 1.0, objSphere = null,
                                     onProgress, onComplete, onCancel } = {}) {
    // All computed paths.  Each entry: { xs, zs, ss } — Float32Array sub-views.
    const allPaths = [];

    let particleIndex = 0;
    let cancelled     = false;
    let timer         = null;

    // ── Phase 1: compute paths in batches ─────────────────────────────────────
    function computeBatch() {
        if (cancelled) return;

        const end = Math.min(particleIndex + BATCH_SIZE, SIM_N_PARTICLES);

        for (let i = particleIndex; i < end; i++) {
            // Start position: random XY spread across inlet face (Z = −TL/2)
            let x = (Math.random() - 0.5) * TW * 0.92;
            let y = (Math.random() - 0.5) * TH * 0.90;
            let z = -TL / 2;

            // Pre-allocate max-length buffers; slice after integration
            const xs = new Float32Array(N_STEPS + 1);
            const ys = new Float32Array(N_STEPS + 1);
            const zs = new Float32Array(N_STEPS + 1);
            const ss = new Float32Array(N_STEPS + 1);
            xs[0] = x;  ys[0] = y;  zs[0] = z;  ss[0] = 1.0;
            let len = 1;

            const U = VSIM * (windMult || 1);

            for (let s = 0; s < N_STEPS; s++) {
                const v    = getVelocity(x, y, z, 0, windMult, objSphere);
                const vmag = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

                x += v.x * DT;
                y += v.y * DT;
                z += v.z * DT;

                // Exit if particle leaves tunnel bounds
                if (z >  TL / 2 + 0.3 ||
                    Math.abs(x) > TW / 2 + 0.4 ||
                    Math.abs(y) > TH / 2 + 0.4) break;

                xs[len] = x;
                ys[len] = y;
                zs[len] = z;
                ss[len] = vmag / U;
                len++;
            }

            if (len >= 3) {
                // subarray() is a zero-copy view — safe since each particle
                // has its own underlying ArrayBuffer.
                allPaths.push({
                    xs: xs.subarray(0, len),
                    ys: ys.subarray(0, len),
                    zs: zs.subarray(0, len),
                    ss: ss.subarray(0, len),
                });
            }
        }

        particleIndex = end;
        onProgress?.(particleIndex / SIM_N_PARTICLES);

        if (particleIndex < SIM_N_PARTICLES) {
            timer = setTimeout(computeBatch, 0);
        } else {
            renderPaths();   // Phase 2
        }
    }

    // ── Phase 2: render computed paths to an offscreen canvas ─────────────────
    function renderPaths() {
        const canvas  = document.createElement('canvas');
        canvas.width  = CW;
        canvas.height = CH;
        const ctx = canvas.getContext('2d');

        const cw = CW - PAD * 2;
        const ch = CH - PAD * 2;

        // ── Background ────────────────────────────────────────────────────────
        const bg = ctx.createLinearGradient(0, 0, 0, CH);
        bg.addColorStop(0, '#04091a');
        bg.addColorStop(1, '#020610');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, CW, CH);

        // ── Coordinate transforms ──────────────────────────────────────────────
        // Z (flow direction)  → horizontal;  left = upstream, right = downstream
        // X (tunnel width)    → vertical;    canvas Y is flipped
        const toX = (wz) => PAD + ((wz + TL / 2) / TL) * cw;
        const toY = (wx) => PAD + (1 - (wx + TW / 2) / TW) * ch;

        // ── Grid ──────────────────────────────────────────────────────────────
        ctx.save();
        ctx.strokeStyle = 'rgba(70, 110, 175, 0.10)';
        ctx.lineWidth   = 0.5;
        for (let gz = Math.ceil(-TL / 2); gz <= TL / 2; gz += 2) {
            ctx.beginPath();
            ctx.moveTo(toX(gz), PAD);
            ctx.lineTo(toX(gz), CH - PAD);
            ctx.stroke();
        }
        for (let gx = -TW / 2; gx <= TW / 2; gx += 2) {
            ctx.beginPath();
            ctx.moveTo(PAD, toY(gx));
            ctx.lineTo(CW - PAD, toY(gx));
            ctx.stroke();
        }
        ctx.restore();

        // ── Tunnel boundary ────────────────────────────────────────────────────
        ctx.save();
        ctx.strokeStyle = 'rgba(90, 140, 215, 0.28)';
        ctx.lineWidth   = 1.5;
        ctx.strokeRect(PAD, PAD, cw, ch);
        ctx.restore();

        // ── Flow-direction arrows on left margin ───────────────────────────────
        ctx.save();
        ctx.strokeStyle = 'rgba(80, 120, 185, 0.22)';
        ctx.lineWidth   = 0.8;
        for (let ay = PAD + 28; ay < CH - PAD; ay += 72) {
            const ax = PAD + 6;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax + 18, ay);
            ctx.moveTo(ax + 12, ay - 4);
            ctx.lineTo(ax + 18, ay);
            ctx.lineTo(ax + 12, ay + 4);
            ctx.stroke();
        }
        ctx.restore();

        // ── Streamlines — 5 bucket passes ─────────────────────────────────────
        //
        // Strategy: for each speed band, iterate ALL paths and accumulate
        // consecutive in-band segments into one continuous canvas subpath.
        // When a segment falls outside the band, the current subpath ends
        // (the next moveTo starts a new one).  Only 5 ctx.stroke() calls total.
        ctx.lineCap = 'round';
        ctx.lineWidth = 0.72;

        for (const bucket of BUCKETS) {
            ctx.beginPath();
            ctx.strokeStyle = bucket.rgba;

            for (const { xs, zs, ss } of allPaths) {
                let inBand = false;
                for (let p = 0, n = xs.length - 1; p < n; p++) {
                    const spd = (ss[p] + ss[p + 1]) * 0.5;
                    if (spd >= bucket.sMin && spd < bucket.sMax) {
                        if (!inBand) {
                            // Start of a new run inside this band
                            ctx.moveTo(toX(zs[p]), toY(xs[p]));
                            inBand = true;
                        }
                        ctx.lineTo(toX(zs[p + 1]), toY(xs[p + 1]));
                    } else {
                        inBand = false;
                    }
                }
            }
            ctx.stroke();
        }

        // ── Object silhouette (drawn on top so lines don't cross it) ──────────
        if (objSphere && objSphere.r > 0) {
            const ocx = toX(objSphere.cz);
            const ocy = toY(objSphere.cx);
            const rz  = (objSphere.r / TL) * cw;
            const rx  = (objSphere.r / TW) * ch;

            // Soft glow halo
            const halo = ctx.createRadialGradient(ocx, ocy, 0, ocx, ocy, Math.max(rz, rx) * 2.2);
            halo.addColorStop(0,   'rgba(100, 160, 255, 0.06)');
            halo.addColorStop(0.5, 'rgba(60,  110, 220, 0.04)');
            halo.addColorStop(1,   'rgba(30,  60,  180, 0.00)');
            ctx.beginPath();
            ctx.ellipse(ocx, ocy, rz * 2.2, rx * 2.2, 0, 0, Math.PI * 2);
            ctx.fillStyle = halo;
            ctx.fill();

            // Solid dark fill
            ctx.beginPath();
            ctx.ellipse(ocx, ocy, rz, rx, 0, 0, Math.PI * 2);
            ctx.fillStyle   = '#040d20';
            ctx.fill();
            ctx.strokeStyle = 'rgba(140, 185, 255, 0.65)';
            ctx.lineWidth   = 1.5;
            ctx.stroke();
        }

        // ── Legend and annotations ─────────────────────────────────────────────
        _drawLegend(ctx, CW, CH, PAD);
        _drawAnnotations(ctx, CW, CH, PAD, allPaths.length);

        onComplete?.(canvas, allPaths);
    }

    timer = setTimeout(computeBatch, 0);
    return {
        cancel() {
            cancelled = true;
            if (timer !== null) clearTimeout(timer);
            onCancel?.();
        },
    };
}

// ── Legend ─────────────────────────────────────────────────────────────────────
function _drawLegend(ctx, W, H, PAD) {
    const lx = W - PAD - 158;
    const ly = PAD + 14;
    const lw = 148, lh = 10;

    const grad = ctx.createLinearGradient(lx, ly, lx + lw, ly);
    [0, 0.25, 0.5, 0.75, 1].forEach((stop, i) => {
        grad.addColorStop(stop, speedRGBA(i * 0.5, 1));
    });

    ctx.fillStyle = grad;
    ctx.fillRect(lx, ly, lw, lh);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth   = 0.5;
    ctx.strokeRect(lx, ly, lw, lh);

    ctx.font      = '10px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(160, 195, 240, 0.70)';
    ctx.textAlign = 'center';
    [[0, '0'], [0.5, '1× U'], [1, '2× U']].forEach(([f, label]) => {
        ctx.fillText(label, lx + lw * f, ly + lh + 13);
    });
    ctx.textAlign = 'left';
    ctx.font      = '9px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(110, 150, 200, 0.55)';
    ctx.fillText('Flow Speed', lx, ly - 4);
}

// ── Annotations ────────────────────────────────────────────────────────────────
function _drawAnnotations(ctx, W, H, PAD, nLines) {
    ctx.save();
    ctx.font      = '11px system-ui, monospace';
    ctx.fillStyle = 'rgba(90, 135, 185, 0.60)';
    ctx.textAlign = 'left';
    ctx.fillText(`Wind Tunnel Simulation  ·  Top View (XZ)  ·  ${nLines.toLocaleString()} streamlines`, PAD, PAD - 10);

    ctx.font      = '10px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(70, 105, 155, 0.45)';
    ctx.fillText('← Upstream', PAD, H - PAD + 18);
    ctx.textAlign = 'right';
    ctx.fillText('Downstream →', W - PAD, H - PAD + 18);
    ctx.restore();
}
