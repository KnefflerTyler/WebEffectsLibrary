/** Three.js CDN (matched to rest of project) */
export const THREE_CDN  = 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';
export const ADDONS_CDN = 'https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/';

// ── Tunnel geometry (world units) ─────────────────────────────────────────────
export const TW = 10;   // tunnel width  (X: -5 … +5)
export const TH = 5;    // tunnel height (Y: -2.5 … +2.5)
export const TL = 14;   // tunnel length (Z: -7 … +7, flow direction = +Z)

// ── Simulation ────────────────────────────────────────────────────────────────
export const VSIM      = 3.0;   // visual flow speed (world units / sec)
export const N_STEPS   = 100;   // arc-length integration steps per streamline
export const N_SX      = 8;     // streamer grid columns (X)
export const N_SY      = 8;     // streamer grid rows    (Y)

// ── Air (SI, sea-level standard atmosphere) ───────────────────────────────────
export const AIR_RHO = 1.225;     // kg m⁻³  density
export const AIR_MU  = 1.81e-5;   // Pa·s    dynamic viscosity

// ── Preset shapes: known drag coefficients ────────────────────────────────────
export const PRESET_CD = {
    sphere:   0.47,
    cube:     1.05,
    cylinder: 0.82,   // flat-ended cylinder, axis aligned with flow
    cone:     0.12,   // pointed cone facing into the flow
    car:      0.30,
};
