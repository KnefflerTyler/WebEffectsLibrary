/**
 * simulate.js — two-phase offline simulation.
 *
 * Phase 1 (0 – LBM_PROGRESS_FRACTION of total progress):
 *   Runs the D3Q19 BGK Lattice-Boltzmann CFD solver in a dedicated WebWorker
 *   (lbm.worker.js).  The converged, shape-specific velocity field is attached
 *   to the working copy of objSphere as `.lbmGrid` so that physics.js uses it
 *   automatically for all subsequent streamline queries.
 *
 * Phase 2 (LBM_PROGRESS_FRACTION – 1.0):
 *   Multi-pass Euler streamline integration through getVelocity() (which now
 *   looks up the real CFD field instead of the former BEM+analytical-wake
 *   approximation).  Adaptive starting positions and an XZ influence grid
 *   concentrate lines near the object.
 */
import { TW, TH, TL, VSIM } from './config.js';
import { getVelocity }       from './physics.js';
import { runLBM }            from './lbm.js';

/** Fraction of total reported progress allocated to the LBM phase. */
export const LBM_PROGRESS_FRACTION = 0.45;

// ── Simulation constants ──────────────────────────────────────────────────────
export const SIM_N_PARTICLES = 12000;   // particles PER PASS (× N_PASSES total integrations)
const N_PASSES     = 3;                 // passes; each samples a different vortex-shedding phase
const N_STEPS      = 960;               // arc-length steps per particle (each = DT*U ≈ 0.066 wu)
const DT           = 0.022;             // timestep (seconds)
const BATCH_SIZE   = 200;               // particles per setTimeout tick

// Influence grid — XZ plane; each pass builds an average velocity field
// that nudges subsequent particles along already-discovered flow paths.
const GRID_NX     = 18;                 // cells along X (tunnel width)
const GRID_NZ     = 25;                 // cells along Z (flow direction)
const INFLUENCE_W = 0.12;               // weight of accumulated field vs analytical

// Near-object filter: only paths that come within this many radii are kept
// in allPaths.  Far straight-line paths still build the influence grid.
const NEAR_THRESH = 4.5;

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

// ── Multi-pass helpers ────────────────────────────────────────────────────────

/** Uniform random starting positions at the inlet face. */
function generateUniformStarts(n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push({
        x: (Math.random() - 0.5) * TW * 0.92,
        y: (Math.random() - 0.5) * TH * 0.90,
    });
    return out;
}

/**
 * Adaptive starts for passes 2+:
 *   50 % — jittered versions of near-object starts from the previous pass
 *   50 % — fresh random for broad coverage
 */
function generateAdaptiveStarts(lastPaths, objSphere, n) {
    const cx = objSphere?.cx ?? 0, cy = objSphere?.cy ?? 0, cz = objSphere?.cz ?? 0;
    const thresh = (objSphere?.r ?? 1.0) * NEAR_THRESH;
    const jitter = 0.28;
    const near = [];
    for (const { xs, ys, zs } of lastPaths) {
        for (let j = 0; j < xs.length; j++) {
            const dx = xs[j]-cx, dy = ys[j]-cy, dz = zs[j]-cz;
            if (Math.sqrt(dx*dx + dy*dy + dz*dz) < thresh) { near.push({ x: xs[0], y: ys[0] }); break; }
        }
    }
    const out = [];
    for (let i = 0; i < n; i++) {
        if (near.length > 0 && Math.random() < 0.5) {
            const b = near[Math.floor(Math.random() * near.length)];
            out.push({ x: b.x + (Math.random()-0.5)*jitter*TW, y: b.y + (Math.random()-0.5)*jitter*TH });
        } else {
            out.push({ x: (Math.random()-0.5)*TW*0.92, y: (Math.random()-0.5)*TH*0.90 });
        }
    }
    return out;
}

/** Blank XZ velocity influence grid. */
function makeGrid() {
    return { vx: new Float32Array(GRID_NX*GRID_NZ), vz: new Float32Array(GRID_NX*GRID_NZ), cnt: new Float32Array(GRID_NX*GRID_NZ) };
}

/** Accumulate a single path's flow direction into the grid. */
function addToGrid(g, xs, zs) {
    for (let j = 1; j < xs.length; j++) {
        const dx = xs[j]-xs[j-1], dz = zs[j]-zs[j-1];
        const len = Math.sqrt(dx*dx+dz*dz);
        if (len < 1e-6) continue;
        const gi = Math.floor((xs[j-1]+TW*0.5)/TW*GRID_NX);
        const gk = Math.floor((zs[j-1]+TL*0.5)/TL*GRID_NZ);
        if (gi<0||gi>=GRID_NX||gk<0||gk>=GRID_NZ) continue;
        const idx = gk*GRID_NX+gi;
        g.vx[idx] += dx/len;  g.vz[idx] += dz/len;  g.cnt[idx]++;
    }
}

/** Normalise accumulated sums to unit-ish direction vectors. */
function normaliseGrid(g) {
    for (let i = 0; i < g.cnt.length; i++) {
        if (g.cnt[i] > 0) { g.vx[i] /= g.cnt[i]; g.vz[i] /= g.cnt[i]; }
    }
}

/** Nearest-cell lookup — returns {vx, vz} influence at world position (x, z). */
function sampleGrid(g, x, z) {
    const gi = Math.max(0, Math.min(GRID_NX-1, Math.floor((x+TW*0.5)/TW*GRID_NX)));
    const gk = Math.max(0, Math.min(GRID_NZ-1, Math.floor((z+TL*0.5)/TL*GRID_NZ)));
    const idx = gk*GRID_NX+gi;
    return { vx: g.vx[idx], vz: g.vz[idx] };
}

/**
 * Returns true if any of the first `len` path points falls within
 * `thresh` radii of the object centre.  No object → always true.
 *
 * @param {Float32Array} xs, ys, zs - path position arrays
 * @param {number}       len        - number of valid samples in those arrays
 * @param {{ cx,cy,cz,r }|null} obj
 * @param {number}       thresh     - proximity multiplier in radii
 */
function isNearObject(xs, ys, zs, len, obj, thresh = NEAR_THRESH) {
    if (!obj) return true;
    const th2 = (obj.r * thresh) ** 2;
    for (let j = 0; j < len; j++) {
        const dx = xs[j] - obj.cx;
        const dy = ys[j] - obj.cy;
        const dz = zs[j] - obj.cz;
        if (dx*dx + dy*dy + dz*dz < th2) return true;
    }
    return false;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Run the two-phase simulation:
 *   1. LBM CFD solve  (produces a real velocity field for this mesh)
 *   2. Multi-pass Euler streamline integration through that field
 *
 * @param {{ windMult, objSphere, onProgress, onComplete, onCancel }} opts
 * @returns {{ cancel: function }}
 */
export function runBatchSimulation({ windMult = 1.0, objSphere = null,
                                     onProgress, onComplete, onCancel,
                                     nPasses          = N_PASSES,
                                     particlesPerPass  = SIM_N_PARTICLES,
                                     nSteps            = N_STEPS,
                                     influenceWeight   = INFLUENCE_W,
                                     nearThresh        = NEAR_THRESH } = {}) {
    // Shallow-clone objSphere so we can attach lbmGrid without mutating the
    // live object that the renderer holds a reference to.
    const workSphere = objSphere ? { ...objSphere } : null;

    let _currentCancel = null;
    const handle = {
        cancel() { _currentCancel?.(); },
    };

    // ── Phase 1: LBM ─────────────────────────────────────────────────────────
    const lbmHandle = runLBM({
        voxels    : objSphere?.voxels ?? null,
        onProgress: p => onProgress?.(p * LBM_PROGRESS_FRACTION),
        onComplete: lbmGrid => {
            if (workSphere) workSphere.lbmGrid = lbmGrid;
            // ── Phase 2: streamlines ────────────────────────────────────────
            _currentCancel = _runStreamlinePhase({
                windMult, objSphere: workSphere,
                onProgress: p => onProgress?.(LBM_PROGRESS_FRACTION + p * (1 - LBM_PROGRESS_FRACTION)),
                onComplete, onCancel,
                nPasses, particlesPerPass, nSteps, influenceWeight, nearThresh,
            }).cancel;
        },
        onCancel,
    });
    _currentCancel = lbmHandle.cancel;

    return handle;
}

/**
 * Internal: multi-pass streamline integration (formerly the body of
 * runBatchSimulation).  Separated so LBM can hand off to it cleanly.
 */
function _runStreamlinePhase({ windMult = 1.0, objSphere = null,
                                onProgress, onComplete, onCancel,
                                nPasses, particlesPerPass, nSteps,
                                influenceWeight, nearThresh }) {
    const allPaths = [];
    const U = VSIM * (windMult || 1);

    // Influence grid built from the previous pass.
    let prevGrid      = null;
    let currGrid      = makeGrid();

    // Starting positions for the current pass; paths of the just-finished pass
    // (used to generate adaptive starts for the next pass).
    let startPositions = generateUniformStarts(particlesPerPass);
    let lastPassPaths  = [];

    let passIndex     = 0;
    let particleIndex = 0;
    let cancelled     = false;
    let timer         = null;

    const totalParticles = nPasses * particlesPerPass;

    function computeBatch() {
        if (cancelled) return;

        const end = Math.min(particleIndex + BATCH_SIZE, particlesPerPass);

        for (let i = particleIndex; i < end; i++) {
            const { x: x0, y: y0 } = startPositions[i];
            let x = x0, y = y0, z = -TL / 2;

            const xs = new Float32Array(nSteps + 1);
            const ys = new Float32Array(nSteps + 1);
            const zs = new Float32Array(nSteps + 1);
            const ss = new Float32Array(nSteps + 1);
            xs[0] = x; ys[0] = y; zs[0] = z; ss[0] = 1.0;
            let len = 1;

            for (let s = 0; s < nSteps; s++) {
                const v = getVelocity(x, y, z, windMult, objSphere);

                // Ensemble influence: blend the previous-pass direction grid into
                // the analytical velocity so later particles preferentially follow
                // already-discovered flow corridors (reduces redundant far-field paths).
                if (prevGrid) {
                    const inf = sampleGrid(prevGrid, x, z);
                    v.x += inf.vx * U * influenceWeight;
                    v.z += inf.vz * U * influenceWeight;
                }

                const vmag = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);

                // Geometric streamline: always advance DT*U world-units per step,
                // regardless of local speed.  This prevents particles from stalling
                // in the LBM no-slip boundary layer or near stagnation zones.
                // Only the true stagnation singularity (|v| ≈ 0) terminates early.
                if (vmag < U * 0.005) break;
                const arcStep = DT * U / vmag;   // normalise to fixed arc-length
                const nx = x + v.x * arcStep;
                const ny = y + v.y * arcStep;
                const nz = z + v.z * arcStep;

                // Stop if the Euler step would carry the particle into the object.
                // Without this guard the particle gets stuck at an interior point and
                // all remaining path segments draw as a straight line into the solid.
                // Use the voxel grid when available so hollow regions (e.g. the torus
                // hole) are never treated as solid — falls back to AABB / sphere.
                if (objSphere) {
                    let wouldEnter;
                    if (objSphere.voxels) {
                        const vox = objSphere.voxels;
                        const vix = Math.floor((nx - vox.ox) / vox.step);
                        const viy = Math.floor((ny - vox.oy) / vox.step);
                        const viz = Math.floor((nz - vox.oz) / vox.step);
                        wouldEnter = (vix >= 0 && viy >= 0 && viz >= 0 &&
                                      vix < vox.nx && viy < vox.ny && viz < vox.nz &&
                                      vox.data[vix + vox.nx * (viy + vox.ny * viz)] !== 0);
                    } else {
                        const dox = nx - objSphere.cx;
                        const doy = ny - objSphere.cy;
                        const doz = nz - objSphere.cz;
                        wouldEnter = (objSphere.hx !== undefined)
                            ? (Math.abs(dox) <= objSphere.hx && Math.abs(doy) <= objSphere.hy && Math.abs(doz) <= objSphere.hz)
                            : (dox*dox + doy*doy + doz*doz < objSphere.r * objSphere.r);
                    }
                    if (wouldEnter) break;
                }

                // Floor is an infinite solid plane at y = -TH/2.
                // Clamp here (not via a side-bounds break) so streamlines
                // slide along it rather than being discarded.
                x = nx; y = Math.max(ny, -TH * 0.5); z = nz;

                if (z > TL/2+0.3 || Math.abs(x) > TW/2+0.4 || y > TH/2+0.4) break;

                xs[len] = x; ys[len] = y; zs[len] = z;
                ss[len] = vmag / U;
                len++;
            }

            if (len >= 3) {
                // All paths (near and far) feed the influence grid so subsequent
                // passes can route particles along established flow corridors.
                addToGrid(currGrid, xs.subarray(0, len), zs.subarray(0, len));

                // Only paths that pass within nearThresh radii of the object are
                // stored in allPaths — far freestream paths carry no useful visual
                // data and would inflate memory usage significantly.
                if (isNearObject(xs, ys, zs, len, objSphere, nearThresh)) {
                    const path = {
                        xs: xs.slice(0, len),
                        ys: ys.slice(0, len),
                        zs: zs.slice(0, len),
                        ss: ss.slice(0, len),
                    };
                    allPaths.push(path);
                    lastPassPaths.push(path);
                }
            }
        }

        particleIndex = end;
        onProgress?.((passIndex * particlesPerPass + particleIndex) / totalParticles);

        if (particleIndex < particlesPerPass) {
            timer = setTimeout(computeBatch, 0);
        } else {
            // End of this pass — lock in the influence grid for the next pass.
            normaliseGrid(currGrid);
            prevGrid = currGrid;
            currGrid = makeGrid();

            // Prepare adaptive starts for next pass from the paths we just found.
            const passedPaths = lastPassPaths.splice(0);
            passIndex++;

            if (passIndex < nPasses) {
                startPositions = generateAdaptiveStarts(passedPaths, objSphere, particlesPerPass);
                particleIndex  = 0;
                timer = setTimeout(computeBatch, 0);
            } else {
                // All passes done — deliver results directly (no 2-D canvas needed).
                timer = setTimeout(() => onComplete?.(null, allPaths), 0);
            }
        }
    }

    // ── Legacy 2-D canvas render (kept for reference; not called by default) ──
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
