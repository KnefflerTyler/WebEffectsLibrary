/**
 * pressureVolume.js — 3-D volumetric pressure field visualization.
 *
 * After simulation, each stored path point carries a local speed ratio ss[j].
 * We compute Cp = 1 − (ss)² at every point and scatter it as a coloured
 * THREE.Points cloud — giving a true 3-D heatmap of the pressure field.
 *
 * Wake filling (inverse coverage approach):
 *   The simulation paths naturally deflect around the object, leaving the
 *   wake region empty.  After emitting all path-based pressure points we
 *   build a 3-D voxel occupancy grid from them, then fill every unoccupied
 *   voxel that falls within the object's downstream influence zone with a
 *   fixed low-pressure (Cp = −0.38) particle cloud.  This correctly shows
 *   the separated wake as blue without any analytical wake model.
 *
 * Performance controls:
 *   STRIDE_PATH — keep every N-th path           (reduces path count)
 *   STRIDE_STEP — keep every N-th step per path  (reduces point density)
 *   MAX_POINTS  — hard cap regardless of strides
 */
import * as THREE from 'three';
import { scene } from './scene.js';

const MAX_POINTS  = 60_000;
const PATH_BUDGET = 45_000;  // path points get this many slots; inverse fill uses the rest
const STRIDE_PATH = 2;
const STRIDE_STEP = 2;

// ── Voxel occupancy grid (covers full tunnel volume) ─────────────────────────
// Used to find areas the simulation paths didn't reach — those become the wake.
const GX = 20, GY = 10, GZ = 28;     // cells per axis
const X0 = -5, Y0 = -2.5, Z0 = -7;   // grid origin (world units)
const DX = 10 / GX, DY = 5 / GY, DZ = 14 / GZ;   // cell size

// Cp applied to unoccupied (wake) voxels — clearly negative, clearly blue
const WAKE_CP        = -0.38;
const WAKE_FILL_N    =  5;     // scattered points emitted per empty voxel
// Cone half-width of downstream influence zone: radius = WAKE_SPREAD * dz + R * 1.5
// (grows downstream to catch the expanding wake)
const WAKE_SPREAD    =  1.8;
const WAKE_NEAR_R    =  2.5;   // radius multiplier for cells at/upstream of object (×R)

// Points whose |Cp| falls below this threshold are pure freestream and hidden.
const CP_THRESHOLD = 0.00;

// ── Colour ramp ──────────────────────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }

function cpColor(cp) {
    const t = Math.max(0, Math.min(1, (cp + 1.25) / 2.25));
    if      (t < 0.25) { const s = t / 0.25;          return [0,             lerp(0.15, 1, s), 1            ]; }
    else if (t < 0.50) { const s = (t - 0.25) / 0.25; return [0,             1,               lerp(1, 0, s) ]; }
    else if (t < 0.75) { const s = (t - 0.50) / 0.25; return [lerp(0, 1, s), 1,               0             ]; }
    else               { const s = (t - 0.75) / 0.25; return [1,             lerp(1, 0.1, s), 0             ]; }
}

// ── Module state ──────────────────────────────────────────────────────────────
let _points      = null;
let _paths3d     = null;
let _objSphere   = null;
let _size        = 140;
let _jitter      = 0.30;
let _opacity     = 0.20;
let _cpThreshold = 0.00;

/**
 * Build a 3-D pressure point cloud from simulation paths and add it to the scene.
 *
 * @param {Array<{xs,ys,zs,ss}>} paths3d
 * @param {{ cx,cy,cz,r }|null}  objSphere  object bounding sphere (for wake zone)
 * @returns {THREE.Points}
 */
export function buildPressureVolume(paths3d, objSphere) {
    const data   = paths3d  ?? _paths3d;
    const sphere = objSphere !== undefined ? objSphere : _objSphere;
    clearPressureVolume();
    _paths3d   = data;
    _objSphere = sphere;
    if (!_paths3d?.length) return null;

    const positions = new Float32Array(MAX_POINTS * 3);
    const colors    = new Float32Array(MAX_POINTS * 3);
    const alphas    = new Float32Array(MAX_POINTS);
    let   idx       = 0;

    // ── Voxel occupancy grid ─────────────────────────────────────────────────
    // We mark a cell occupied for every path position that falls inside the
    // grid — even those filtered out by cpThreshold — so inverse fill doesn't
    // re-fill cells that already have coverage (just invisible coverage).
    const occupied = new Uint8Array(GX * GY * GZ);

    function markOccupied(wx, wy, wz) {
        const ix = Math.floor((wx - X0) / DX);
        const iy = Math.floor((wy - Y0) / DY);
        const iz = Math.floor((wz - Z0) / DZ);
        if (ix >= 0 && ix < GX && iy >= 0 && iy < GY && iz >= 0 && iz < GZ)
            occupied[ix * GY * GZ + iy * GZ + iz] = 1;
    }

    // ── Simulated path points ────────────────────────────────────────────────
    // Capped at PATH_BUDGET; remaining budget used by inverse wake fill below.
    outer:
    for (let p = 0; p < _paths3d.length; p += STRIDE_PATH) {
        const { xs, ys, zs, ss } = _paths3d[p];
        for (let s = 0; s < xs.length; s += STRIDE_STEP) {
            if (idx >= PATH_BUDGET) break outer;

            // Always mark the voxel so inverse fill knows this region is covered
            markOccupied(xs[s], ys[s], zs[s]);

            const cp  = 1.0 - ss[s] * ss[s];   // Bernoulli: Cp = 1 − (|v|/U)²
            const acp = Math.abs(cp);
            if (acp < _cpThreshold) continue;

            // 1–3 copies per step proportional to |Cp| — high-pressure and
            // suction zones appear denser; freestream stays sparse.
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

    // ── Inverse coverage fill (wake / low-pressure regions) ─────────────────
    // Any voxel that the simulation paths left empty is an area the airflow
    // avoided — i.e. the separated wake.  Fill these with a fixed low-pressure
    // colour so the wake region is always visible regardless of how few paths
    // entered it.
    //
    // To avoid filling freestream corners that are just sparsely seeded,
    // restrict the fill to the downstream influence cone:
    //   • always at least WAKE_NEAR_R × R lateral extent around the object
    //   • cone expands downstream as WAKE_SPREAD × dz  (dz = z − object centre)
    if (Math.abs(WAKE_CP) >= _cpThreshold) {
        const { cx = 0, cy = 0, cz = 0, r: R = 1 } = _objSphere ?? {};

        for (let ix = 0; ix < GX && idx < MAX_POINTS; ix++) {
            for (let iy = 0; iy < GY && idx < MAX_POINTS; iy++) {
                for (let iz = 0; iz < GZ && idx < MAX_POINTS; iz++) {
                    if (occupied[ix * GY * GZ + iy * GZ + iz]) continue;

                    // Voxel centre in world space
                    const vx = X0 + (ix + 0.5) * DX;
                    const vy = Y0 + (iy + 0.5) * DY;
                    const vz = Z0 + (iz + 0.5) * DZ;

                    // Skip cells inside the object solid
                    const ddx = vx - cx, ddy = vy - cy, ddz = vz - cz;
                    if (ddx*ddx + ddy*ddy + ddz*ddz < R * R * 0.92) continue;

                    // Skip cells too far upstream (no wake there)
                    if (ddz < -R * 1.2) continue;

                    // Skip cells outside the downstream influence cone
                    const radial = Math.sqrt(ddx * ddx + ddy * ddy);
                    const maxR   = ddz > 0
                        ? WAKE_SPREAD * ddz + R * 1.5    // expanding cone downstream
                        : R * WAKE_NEAR_R;               // tight cap upstream of object
                    if (radial > maxR) continue;

                    // Emit WAKE_FILL_N randomly-scattered points inside this voxel
                    const [wr, wg, wb]  = cpColor(WAKE_CP);
                    const wAlpha        = Math.min(1.0,
                        (Math.abs(WAKE_CP) - _cpThreshold) / 0.40 + 0.15);
                    for (let k = 0; k < WAKE_FILL_N && idx < MAX_POINTS; k++) {
                        positions[idx * 3]     = vx + (Math.random() - 0.5) * DX;
                        positions[idx * 3 + 1] = vy + (Math.random() - 0.5) * DY;
                        positions[idx * 3 + 2] = vz + (Math.random() - 0.5) * DZ;
                        colors[idx * 3]        = wr;
                        colors[idx * 3 + 1]    = wg;
                        colors[idx * 3 + 2]    = wb;
                        alphas[idx]            = wAlpha;
                        idx++;
                    }
                }
            }
        }
    }

    // Per-point random jitter offsets [-1,1]; vertex shader scales by uJitter.
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
