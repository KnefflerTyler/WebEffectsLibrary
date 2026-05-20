/**
 * pressureVolume.js — 3-D volumetric pressure field visualization.
 *
 * After simulation, each stored path point carries a local speed ratio ss[j].
 * We compute Cp = 1 − (ss)² at every point and scatter it as a coloured
 * THREE.Points cloud — giving a true 3-D heatmap of the pressure field.
 *
 * This replaces the flat XZ pressure plane.  By orbiting the view you can see:
 *   • Red stagnation zone upstream of the object (Cp ≈ +1)
 *   • Blue suction band around the widest cross-section (Cp ≈ −1.25)
 *   • Low-pressure wake tube behind the object (Cp < 0)
 *
 * Performance controls:
 *   STRIDE_PATH — keep every N-th path           (reduces path count)
 *   STRIDE_STEP — keep every N-th step per path  (reduces point density)
 *   MAX_POINTS  — hard cap regardless of strides
 */
import * as THREE from 'three';
import { scene } from './scene.js';
import { getVelocity } from './physics.js';
import { VSIM } from './config.js';

const MAX_POINTS  = 60_000;
const STRIDE_PATH = 2;   // use every 2nd path
const STRIDE_STEP = 2;   // use every 2nd step along each path

// Points whose |Cp| falls below this threshold are pure freestream (no pressure
// deviation) and should not be rendered — they only add noise and white blobs.
const CP_THRESHOLD = 0.00;

// ── Colour ramp ──────────────────────────────────────────────────────────────
// Standard CFD "jet" rainbow: blue (suction / low pressure) → cyan → green
// (freestream, Cp ≈ 0) → yellow → red (stagnation / high pressure).
// This looks clearly different from the velocity heat-map and matches the
// physical intuition: blue = air pulled away from surface, red = air pushed in.
function lerp(a, b, t) { return a + (b - a) * t; }

function cpColor(cp) {
    const t = Math.max(0, Math.min(1, (cp + 1.25) / 2.25));
    if      (t < 0.25) { const s = t / 0.25;          return [0,             lerp(0.15, 1, s), 1            ]; } // blue→cyan
    else if (t < 0.50) { const s = (t - 0.25) / 0.25; return [0,             1,               lerp(1, 0, s) ]; } // cyan→green
    else if (t < 0.75) { const s = (t - 0.50) / 0.25; return [lerp(0, 1, s), 1,               0             ]; } // green→yellow
    else               { const s = (t - 0.75) / 0.25; return [1,             lerp(1, 0.1, s), 0             ]; } // yellow→red
}

// ── Module state ──────────────────────────────────────────────────────────────
let _points      = null;
let _paths3d     = null;  // cached so threshold changes can rebuild without re-simulating
let _objSphere   = null;  // cached for analytical grid fill
let _size        = 140;   // world-space point size (gl_PointSize = uSize / dist)
let _jitter      = 0.30;  // random position spread (world units) to break tube structure
let _opacity     = 0.20;  // per-particle base opacity (low; additive blending accumulates)
let _cpThreshold = 0.00;  // |Cp| below this is treated as freestream and hidden

/**
 * Build a 3-D pressure point cloud from simulation paths and add it to the scene.
 * Each point is a simulation sample coloured by Cp = 1 − (|v|/U)².
 *
 * @param {Array<{xs,ys,zs,ss}>} paths3d
 * @param {{ cx,cy,cz,r }|null}  objSphere  object bounding sphere for wake fill
 * @returns {THREE.Points}
 */
export function buildPressureVolume(paths3d, objSphere) {
    const data   = paths3d  ?? _paths3d;
    const sphere = objSphere !== undefined ? objSphere : _objSphere;
    clearPressureVolume();
    _paths3d   = data;
    _objSphere = sphere;
    if (!_paths3d?.length) return null;

    // Allocate MAX_POINTS upfront.
    // IMPORTANT: wake fill runs FIRST so it always gets rendered — the path
    // loop is capped at PATH_BUDGET and uses whatever space remains.
    const PATH_BUDGET = 40_000;   // paths get at most this many points
    const positions = new Float32Array(MAX_POINTS * 3);
    const colors    = new Float32Array(MAX_POINTS * 3);
    const alphas    = new Float32Array(MAX_POINTS);
    let   idx       = 0;

    // ── Flow-following analytical fill (runs FIRST to guarantee wake is shown) ─
    //
    //  1. Wake streamlines — seeds on a disc just behind the sphere, integrated
    //     forward with getVelocity.  Potential-flow Bernoulli wrongly gives
    //     Cp > 0 in the wake (v < U → higher pressure), so we override with the
    //     empirical separated-wake base pressure: Cp ≈ −0.40 · fDecay · fRadial.
    //
    //  2. Near-body shell — 3 concentric layers around the sphere for the
    //     stagnation blob and suction band that are poorly sampled by the paths.
    if (_objSphere) {
        const { cx, cy, cz, r: R } = _objSphere;

        // ── 1. Wake streamlines ──────────────────────────────────────────────
        const SEEDS   = 13;          // SEEDS×SEEDS seed disc
        const N_STEPS = 65;          // integration steps per streamline
        const DS      = R * 0.20;    // arc-length step (world units)

        for (let si = 0; si < SEEDS && idx < MAX_POINTS; si++) {
            for (let sj = 0; sj < SEEDS && idx < MAX_POINTS; sj++) {
                const tx = (sj + 0.5) / SEEDS * 2.0 - 1.0;  // −1…+1 across X
                const ty = (si + 0.5) / SEEDS * 2.0 - 1.0;  //          …  Y
                if (tx * tx + ty * ty > 0.85) continue;       // outside shadow disc

                let wx = cx + tx * R;
                let wy = cy + ty * R;
                let wz = cz + R * 1.06;   // start just behind the sphere

                for (let step = 0; step < N_STEPS && idx < MAX_POINTS; step++) {
                    const ddx = wx - cx, ddy = wy - cy, ddz = wz - cz;

                    const v   = getVelocity(wx, wy, wz, 0, 1.0, _objSphere);
                    const spd = Math.max(Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z), 0.01);

                    // Physically correct wake pressure: separated wake is SUB-freestream.
                    // Bernoulli from potential flow gives the wrong sign here because it
                    // sees reduced velocity → higher pressure, opposite of reality.
                    //
                    // For non-sphere objects (box, cylinder…) use actual half-extents
                    // for the wake cross-section so the flat back face produces a broad
                    // uniform low-pressure zone, not a small circular Gaussian.
                    let cp;
                    if (ddz > 0) {
                        const fDecay  = Math.exp(-ddz / (3.8 * R));
                        // Half-extents of the object's shadow cross-section
                        const wHx = _objSphere.hx ?? R;
                        const wHy = _objSphere.hy ?? R;
                        // Normalised radial distance: 0–1 = inside shadow, >1 = outside
                        const normR = Math.sqrt((ddx/wHx)*(ddx/wHx) + (ddy/wHy)*(ddy/wHy));
                        // Flat Cp inside the object's shadow, smooth Gaussian taper outside
                        const fRadial = normR < 1.0 ? 1.0 : Math.exp(-2.0 * (normR-1.0)*(normR-1.0));
                        cp = -0.40 * fDecay * fRadial;
                    } else {
                        cp = 1.0 - (spd / VSIM) * (spd / VSIM);
                    }

                    if (Math.abs(cp) >= _cpThreshold) {
                        positions[idx*3]     = wx;
                        positions[idx*3 + 1] = wy;
                        positions[idx*3 + 2] = wz;
                        const [r, g, b] = cpColor(cp);
                        colors[idx*3]     = r;
                        colors[idx*3 + 1] = g;
                        colors[idx*3 + 2] = b;
                        alphas[idx] = Math.min(1.0, Math.abs(cp) / 0.45 + 0.12);
                        idx++;
                    }

                    // Advance one arc-length step along the local flow direction
                    wx += (v.x / spd) * DS;
                    wy += (v.y / spd) * DS;
                    wz += (v.z / spd) * DS;

                    if (wz > cz + 9.0 * R) break;
                }
            }
        }

        // ── 2. Near-body shell (stagnation + suction band) ───────────────────
        // Start at R*1.20 (not 1.05) so the shell particles clear the sphere
        // mesh surface and pass the depth test from all view angles.
        const NTH = 12, NPH = 20;
        for (let ti = 0; ti < NTH && idx < MAX_POINTS; ti++) {
            const theta = Math.PI * (ti + 0.5) / NTH;
            for (let pi2 = 0; pi2 < NPH && idx < MAX_POINTS; pi2++) {
                const phi = 2.0 * Math.PI * (pi2 + 0.5) / NPH;
                for (let ri = 0; ri < 3 && idx < MAX_POINTS; ri++) {
                    const dist = R * (1.20 + ri * 0.32);
                    const px = cx + dist * Math.sin(theta) * Math.cos(phi);
                    const py = cy + dist * Math.sin(theta) * Math.sin(phi);
                    const pz = cz + dist * Math.cos(theta);

                    // Downstream hemisphere: potential-flow Bernoulli is symmetric and
                    // gives a stagnation zone (Cp≈+1, red) directly behind the object,
                    // which is physically wrong for any real separated wake.  Use the
                    // same empirical wake formula as the streamlines for pz > cz.
                    const ddz_s = pz - cz;
                    let cp;
                    if (ddz_s > 0) {
                        const fDecay_s  = Math.exp(-ddz_s / (3.8 * R));
                        const wHx_s = _objSphere.hx ?? R;
                        const wHy_s = _objSphere.hy ?? R;
                        const ddx_s = px - cx, ddy_s = py - cy;
                        const normR_s = Math.sqrt((ddx_s/wHx_s)*(ddx_s/wHx_s) + (ddy_s/wHy_s)*(ddy_s/wHy_s));
                        const fRad_s  = normR_s < 1.0 ? 1.0 : Math.exp(-2.0 * (normR_s-1.0)*(normR_s-1.0));
                        cp = -0.40 * fDecay_s * fRad_s;
                    } else {
                        const v    = getVelocity(px, py, pz, 0, 1.0, _objSphere);
                        const vmag = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);
                        cp = 1.0 - (vmag / VSIM) * (vmag / VSIM);
                    }

                    if (Math.abs(cp) < _cpThreshold) continue;

                    positions[idx*3]     = px;
                    positions[idx*3 + 1] = py;
                    positions[idx*3 + 2] = pz;
                    const [r, g, b] = cpColor(cp);
                    colors[idx*3]     = r;
                    colors[idx*3 + 1] = g;
                    colors[idx*3 + 2] = b;
                    alphas[idx] = Math.min(1.0, (Math.abs(cp) - _cpThreshold) / 0.40 + 0.10);
                    idx++;
                }
            }
        }
    }

    // ── Simulated path points (runs after wake fill to use remaining budget) ──
    // Capped at PATH_BUDGET so the wake above always gets rendered even when
    // the simulation produces a large number of streamline steps.
    outer:
    for (let p = 0; p < _paths3d.length; p += STRIDE_PATH) {
        const { xs, ys, zs, ss } = _paths3d[p];
        for (let s = 0; s < xs.length; s += STRIDE_STEP) {
            if (idx >= PATH_BUDGET) break outer;

            const cp  = 1.0 - ss[s] * ss[s];  // Cp = 1 − (|v|/U)²
            const acp = Math.abs(cp);
            if (acp < _cpThreshold) continue;

            // Emit 1–3 copies per step proportional to |Cp| so high-pressure
            // and suction zones appear visually denser — freestream stays sparse.
            const nCopies = Math.min(3, 1 + Math.floor(acp * 2.5));
            for (let k = 0; k < nCopies && idx < PATH_BUDGET; k++) {
                positions[idx * 3]     = xs[s];
                positions[idx * 3 + 1] = ys[s];
                positions[idx * 3 + 2] = zs[s];

                const [r, g, b] = cpColor(cp);
                colors[idx * 3]     = r;
                colors[idx * 3 + 1] = g;
                colors[idx * 3 + 2] = b;

                alphas[idx] = Math.min(1.0, (acp - _cpThreshold) / 0.3);
                idx++;
            }
        }
    }

    // Per-point random jitter offsets (pre-normalised to [-1,1] per axis).
    // The vertex shader scales them by uJitter so the spread is live-adjustable.
    const jitters = new Float32Array(idx * 3);
    for (let i = 0; i < idx * 3; i++) jitters[i] = Math.random() * 2.0 - 1.0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions.subarray(0, idx * 3), 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors.subarray(0, idx * 3),    3));
    geo.setAttribute('aAlpha',   new THREE.BufferAttribute(alphas.subarray(0, idx),         1));
    geo.setAttribute('aJitter',  new THREE.BufferAttribute(jitters,                         3));

    const mat = new THREE.ShaderMaterial({
        vertexShader: `
            attribute vec3  color;
            attribute float aAlpha;
            attribute vec3  aJitter;
            uniform   float uSize;
            uniform   float uJitter;
            varying   vec3  vColor;
            varying   float vAlpha;
            void main() {
                vColor = color;
                vAlpha = aAlpha;
                // Spread each point by a random per-vertex offset so the
                // streamline tube structure is broken up into a cloud.
                vec3 pos   = position + aJitter * uJitter;
                vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
                // World-space-proportional size — larger uSize gives bigger splats.
                gl_PointSize = uSize / max(-mvPos.z, 0.5);
                gl_Position  = projectionMatrix * mvPos;
            }`,
        fragmentShader: `
            uniform  float uOpacity;
            varying  vec3  vColor;
            varying  float vAlpha;
            void main() {
                vec2  uv      = gl_PointCoord - 0.5;
                float r       = length(uv);
                if (r > 0.5) discard;
                // Soft Gaussian splat — centre bright, edges fade to zero.
                float falloff = exp(-10.0 * r * r);
                float alpha   = vAlpha * falloff * uOpacity;
                if (alpha < 0.003) discard;
                // Slight core brightening enhances the emission look under
                // additive blending.
                gl_FragColor = vec4(vColor * (0.7 + 0.3 * falloff), alpha);
            }`,
        uniforms: {
            uSize   : { value: _size    },
            uJitter : { value: _jitter  },
            uOpacity: { value: _opacity },
        },
        transparent: true,
        depthWrite : false,
        depthTest  : true,
        blending   : THREE.AdditiveBlending,
    });

    _points = new THREE.Points(geo, mat);
    // Render after all opaque meshes (renderOrder 0) so the depth buffer is
    // fully populated before any particle depth-tests — prevents the sphere
    // surface from clipping particles that sit just outside it.
    _points.renderOrder = 1;
    scene.add(_points);
    return _points;
}

/** Show or hide the pressure volume. */
export function setPressureVolumeVisible(visible) {
    if (_points) _points.visible = visible;
}

/** Adjust billboard size (world-space; larger = bigger splats). */
export function setPressureVolumeSize(size) {
    _size = size;
    if (_points) _points.material.uniforms.uSize.value = size;
}

/** Adjust jitter spread (world units). Higher values break up tube structure more. */
export function setPressureVolumeJitter(jitter) {
    _jitter = jitter;
    if (_points) _points.material.uniforms.uJitter.value = jitter;
}

/** Adjust per-particle opacity (0–1). Low values let additive blending build density. */
export function setPressureVolumeOpacity(opacity) {
    _opacity = opacity;
    if (_points) _points.material.uniforms.uOpacity.value = opacity;
}

/** Set the minimum |Cp| to display. Points below this threshold are hidden.
 *  Triggers a geometry rebuild so the change takes effect immediately. */
export function setCpThreshold(threshold) {
    _cpThreshold = threshold;
    if (_paths3d) buildPressureVolume(_paths3d, _objSphere);
}

/** Returns true when the volume is in the scene. */
export function isPressureVolumeActive() {
    return _points !== null;
}

/** Remove the volume and free GPU resources. */
export function clearPressureVolume() {
    if (_points) {
        scene.remove(_points);
        _points.geometry.dispose();
        _points.material.dispose();
        _points = null;
    }
    _paths3d   = null;
    _objSphere = null;  // discard so a new simulation starts fresh
}
