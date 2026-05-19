/**
 * smoke.js — advected billboard-particle smoke visualisation.
 *
 * Each particle is a soft Gaussian puff that moves with the velocity field
 * using an Euler step.  Unlike streamlines (which re-integrate from scratch
 * every frame), particles remember where they were, so they:
 *
 *   • Never "jump" — motion is smooth and continuous.
 *   • Cluster naturally in the wake where flow slows down, creating a
 *     denser volumetric cloud exactly where turbulence is highest.
 *   • Thin out in fast freestream regions, creating coherent thread-like
 *     wisps — visually similar to real smoke-wire experiments.
 *
 * Particles that exit the tunnel bounds reset to a random inlet position,
 * simulating continuous dye injection from the upstream face.
 *
 * Rendered as THREE.Points with AdditiveBlending.  The variable point size
 * (large in slow flow, small in fast flow) and per-particle alpha fade
 * near the object are handled entirely in the vertex/fragment shaders.
 */
import * as THREE from 'three';
import { TW, TH, TL, VSIM } from './config.js';
import { SMOKE_VERT, SMOKE_FRAG } from './shaders.js';
import { getVelocity } from './physics.js';
import { scene } from './scene.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const N_SMOKE = 3000;

const lerp = (a, b, t) => a + (b - a) * t;

// ── Smoke rake: structured inlet injection points ─────────────────────────────
// Real wind tunnels inject smoke from a "rake" — a row of evenly spaced needles
// at the tunnel inlet.  Using a structured grid (8 cols × 5 rows = 40 points)
// creates coherent streaklines instead of a random volumetric fill.
const N_INJ_X = 8, N_INJ_Y = 5;
const N_INJ   = N_INJ_X * N_INJ_Y;   // 40 injection points
const injX    = new Float32Array(N_INJ);
const injY    = new Float32Array(N_INJ);
for (let iy = 0; iy < N_INJ_Y; iy++) {
    for (let ix = 0; ix < N_INJ_X; ix++) {
        const idx = iy * N_INJ_X + ix;
        injX[idx] = lerp(-TW / 2 * 0.85, TW / 2 * 0.85, N_INJ_X > 1 ? ix / (N_INJ_X - 1) : 0.5);
        injY[idx] = lerp(-TH / 2 * 0.70, TH / 2 * 0.70, N_INJ_Y > 1 ? iy / (N_INJ_Y - 1) : 0.5);
    }
}

// ── Per-particle CPU state ────────────────────────────────────────────────────
const px = new Float32Array(N_SMOKE);
const py = new Float32Array(N_SMOKE);
const pz = new Float32Array(N_SMOKE);

// ── GPU buffers ───────────────────────────────────────────────────────────────
const positions = new Float32Array(N_SMOKE * 3);
const speeds    = new Float32Array(N_SMOKE);

// Initialise particles at their assigned rake injection point, staggered along Z
// so the tunnel appears filled immediately (no burst from the inlet at t=0).
for (let i = 0; i < N_SMOKE; i++) {
    const injIdx = i % N_INJ;
    px[i] = injX[injIdx];
    py[i] = injY[injIdx];
    pz[i] = lerp(-TL / 2, TL / 2, Math.random());   // stagger z for immediate visual fill
    speeds[i]            = 1.0;
    positions[i * 3    ] = px[i];
    positions[i * 3 + 1] = py[i];
    positions[i * 3 + 2] = pz[i];
}

// ── Shared shader material ────────────────────────────────────────────────────
const smokeMat = new THREE.ShaderMaterial({
    vertexShader  : SMOKE_VERT,
    fragmentShader: SMOKE_FRAG,
    uniforms: {
        uObjCenter: { value: new THREE.Vector3(0, 0, 0) },
        uObjRadius: { value: 0.0 },
        uFadeMult : { value: 3.0 },
        uSizeScale: { value: 1.0 },
        uOpacity  : { value: 0.35 },
        uDotMode  : { value: 0.0 },
    },
    transparent: true,
    depthWrite : false,
    blending   : THREE.NormalBlending,
});

// ── THREE.Points geometry ─────────────────────────────────────────────────────
const geo     = new THREE.BufferGeometry();
const posAttr = new THREE.BufferAttribute(positions, 3);
const spdAttr = new THREE.BufferAttribute(speeds,    1);
posAttr.usage = THREE.DynamicDrawUsage;
spdAttr.usage = THREE.DynamicDrawUsage;
geo.setAttribute('position', posAttr);
geo.setAttribute('aSpeed',   spdAttr);

const points = new THREE.Points(geo, smokeMat);
points.visible = false;     // hidden by default — enable via the UI checkbox
scene.add(points);

// ── Internal time ─────────────────────────────────────────────────────────────
let simTime = 0;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Advance every smoke particle by one Euler step and upload to GPU.
 * Call once per animation frame while the simulation is running.
 *
 * @param {number} dt         - delta-time in seconds
 * @param {number} windMult   - visual speed multiplier from UI
 * @param {{ cx,cy,cz,r }|null} objSphere
 */
export function advanceSmoke(dt, windMult, objSphere) {
    simTime += dt;
    const U = VSIM * windMult;

    // Keep proximity-fade uniforms in sync with the current object
    if (objSphere) {
        smokeMat.uniforms.uObjCenter.value.set(objSphere.cx, objSphere.cy, objSphere.cz);
        smokeMat.uniforms.uObjRadius.value = objSphere.r;
    } else {
        smokeMat.uniforms.uObjRadius.value = 0.0;
    }

    for (let i = 0; i < N_SMOKE; i++) {
        let x = px[i], y = py[i], z = pz[i];

        const v    = getVelocity(x, y, z, simTime, windMult, objSphere);
        const vmag = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

        // Euler step — simple but sufficient at typical dt ≈ 0.016 s
        x += v.x * dt;
        y += v.y * dt;
        z += v.z * dt;

        // Reset to the particle's assigned rake injection point when it exits
        if (z > TL / 2 + 0.3 ||
            Math.abs(x) > TW / 2 + 0.3 ||
            Math.abs(y) > TH / 2 + 0.3) {
            const injIdx = i % N_INJ;
            x = injX[injIdx];
            y = injY[injIdx];
            z = -TL / 2;
        }

        px[i] = x;  py[i] = y;  pz[i] = z;

        positions[i * 3    ] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
        speeds[i]             = U > 0 ? vmag / U : 1.0;
    }

    posAttr.needsUpdate = true;
    spdAttr.needsUpdate = true;
}

/** Show or hide the smoke layer. */
export function setSmokeVisible(visible) {
    points.visible = visible;
}

/**
 * Sync the fade-range with the shared Visibility range slider.
 * @param {number} mult  visible radius = objRadius * mult
 */
export function setSmokeVisibilityRange(mult) {
    smokeMat.uniforms.uFadeMult.value = mult;
}

/**
 * Set how many particles are active (0 – N_SMOKE).
 * Uses setDrawRange so no buffer reallocation is needed.
 * @param {number} count
 */
export function setSmokeCount(count) {
    geo.setDrawRange(0, Math.max(1, Math.min(count, N_SMOKE)));
}

/**
 * Scale all particle point sizes by a multiplier.
 * @param {number} scale  e.g. 0.5 = half size, 2.0 = double
 */
export function setSmokeSizeScale(scale) {
    smokeMat.uniforms.uSizeScale.value = scale;
}

/**
 * Overall opacity multiplier for the smoke puffs.
 * @param {number} opacity  0.0 – 1.0
 */
export function setSmokeOpacity(opacity) {
    smokeMat.uniforms.uOpacity.value = opacity;
}

/**
 * Switch between soft Gaussian puffs (false) and hard flat dots (true).
 * @param {boolean} enabled
 */
export function setSmokeDotsOnly(enabled) {
    smokeMat.uniforms.uDotMode.value = enabled ? 1.0 : 0.0;
}
