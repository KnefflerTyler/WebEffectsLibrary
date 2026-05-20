/**
 * stats.js — DOM stats panel display and legend canvas.
 *
 * All physics constants are imported from config.js.
 * No THREE or DOM state beyond element lookups.
 */
import { AIR_RHO, AIR_MU } from './config.js';

const $ = id => document.getElementById(id);

/**
 * Update every stat readout in the side panel.
 *
 * @param {{ label:string, cd:number, physLenM:number, physAreaM2:number }} stats
 * @param {number} windMs  - wind speed in m/s (from slider, VSIM * multiplier)
 */
export function updateStats(stats, windMs) {
    if (!stats) return;

    const { label, cd, physLenM, physAreaM2 } = stats;

    // ── Aerodynamic force / flow metrics ──────────────────────────────────────
    // Fd  = ½ρU²·Cd·A    Aerodynamic drag force (Newtons)
    // Re  = ρUL/μ         Reynolds number (dimensionless; turbulent above ~5×10⁵)
    // Pw  = Fd·U          Mechanical power consumed by drag (Watts)
    // Wl  = Cd·L          "Aerodynamic waste length" — lower = more streamlined
    // eff = 1 − Cd/1.17   Efficiency vs. a flat plate (Cd = 1.17), clamped 0–100 %
    const Fd  = 0.5 * AIR_RHO * windMs * windMs * cd * physAreaM2;
    const Re  = AIR_RHO * windMs * physLenM / AIR_MU;
    const Pw  = Fd * windMs;
    const Wl  = cd * physLenM;
    const eff = Math.round((1 - cd / 1.17) * 100);

    // Clamp efficiency to 0–100
    const effPct = Math.max(0, Math.min(100, eff));

    const setText = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
    const setWidth = (id, pct) => { const el = $(id); if (el) el.style.width = pct + '%'; };

    setText('stat-object-label', label);
    setText('stat-cd',   cd.toFixed(3));
    setText('stat-fd',   Fd.toFixed(1)  + ' N');
    setText('stat-re',   Re.toExponential(2));
    setText('stat-area', physAreaM2.toFixed(3) + ' m²');
    setText('stat-pow',  Pw.toFixed(1)  + ' W');
    setText('stat-wake', Wl.toFixed(3));
    setText('stat-eff',  effPct + '%');
    setWidth('stat-eff-bar', effPct);

    // Colour the efficiency bar
    const bar = $('stat-eff-bar');
    if (bar) {
        bar.style.background =
            effPct > 70 ? '#22cc66' :
            effPct > 40 ? '#eeaa22' : '#cc3333';
    }
}

/**
 * Draw the velocity → colour legend on the given canvas element.
 * Uses the same speed ramp as the GLSL speedRamp() function.
 * @param {string} canvasId
 */
export function drawLegend(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const W = canvas.width  || 200;
    const H = canvas.height || 18;
    const ctx = canvas.getContext('2d');

    // Gradient: blue → cyan → green → yellow → red
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0.00, '#0000ff');  // v = 0 × U  (stagnation)
    grad.addColorStop(0.25, '#00ffff');  // v = 0.5× U
    grad.addColorStop(0.50, '#00ff00');  // v = 1.0× U (freestream)
    grad.addColorStop(0.75, '#ffff00');  // v = 1.5× U
    grad.addColorStop(1.00, '#ff0000');  // v = 2.0× U (equator)

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Labels
    ctx.fillStyle    = '#fff';
    ctx.font         = '9px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText('0',   2, H / 2);
    ctx.fillText('U',   W / 2 - 4, H / 2);
    ctx.fillText('2U',  W - 16, H / 2);
}

/**
 * Draw the Cp → colour legend on the given canvas element.
 * Gradient matches the cpColor() ramp in pressureVolume.js:
 *   blue (Cp ≈ −1.25, suction) → cyan → green (Cp = 0) → yellow → red (Cp ≈ +1, stagnation)
 * @param {string} canvasId
 */
export function drawCpLegend(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const W = canvas.width  || 200;
    const H = canvas.height || 18;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0.00, '#0026FF');  // Cp ≈ −1.25  blue   (strong suction)
    grad.addColorStop(0.25, '#00FFFF');  // Cp ≈ −0.69  cyan
    grad.addColorStop(0.50, '#00FF00');  // Cp =  0      green  (freestream)
    grad.addColorStop(0.75, '#FFFF00');  // Cp ≈ +0.44  yellow
    grad.addColorStop(1.00, '#FF1A00');  // Cp ≈ +1.00  red    (stagnation)

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle    = '#111';
    ctx.font         = '9px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText('\u22121.25', 2,       H / 2);
    ctx.fillText('0',     W / 2 - 3, H / 2);
    ctx.fillText('+1',    W - 14,    H / 2);
}
