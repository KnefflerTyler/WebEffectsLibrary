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

const MAX_POINTS  = 250_000;
const STRIDE_PATH = 2;   // use every 2nd path
const STRIDE_STEP = 2;   // use every 2nd step along each path

// ── Colour ramp (mirrors GLSL cpRamp) ────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }

function cpColor(cp) {
    const t = Math.max(0, Math.min(1, (cp + 1.25) / 2.25));
    if (t < 0.5) {
        const s = t * 2;
        return [lerp(0.05, 1.0, s), lerp(0.12, 1.0, s), lerp(0.88, 1.0, s)];
    } else {
        const s = (t - 0.5) * 2;
        return [lerp(1.0, 0.88, s), lerp(1.0, 0.06, s), lerp(1.0, 0.06, s)];
    }
}

// ── Module state ──────────────────────────────────────────────────────────────
let _points = null;

/**
 * Build a 3-D pressure point cloud from simulation paths and add it to the scene.
 * Each point is a simulation sample coloured by Cp = 1 − (|v|/U)².
 *
 * @param {Array<{xs,ys,zs,ss}>} paths3d
 * @returns {THREE.Points}
 */
export function buildPressureVolume(paths3d) {
    clearPressureVolume();
    if (!paths3d?.length) return null;

    // ── Pre-count so we allocate exact buffers ─────────────────────────────
    let nPoints = 0;
    for (let p = 0; p < paths3d.length; p += STRIDE_PATH) {
        nPoints += Math.ceil(paths3d[p].xs.length / STRIDE_STEP);
        if (nPoints >= MAX_POINTS) { nPoints = MAX_POINTS; break; }
    }

    const positions = new Float32Array(nPoints * 3);
    const colors    = new Float32Array(nPoints * 3);
    let   idx       = 0;

    outer:
    for (let p = 0; p < paths3d.length; p += STRIDE_PATH) {
        const { xs, ys, zs, ss } = paths3d[p];
        for (let s = 0; s < xs.length; s += STRIDE_STEP) {
            if (idx >= nPoints) break outer;

            positions[idx * 3]     = xs[s];
            positions[idx * 3 + 1] = ys[s];
            positions[idx * 3 + 2] = zs[s];

            const cp       = 1.0 - ss[s] * ss[s];  // Cp = 1 − (|v|/U)²
            const [r, g, b] = cpColor(cp);
            colors[idx * 3]     = r;
            colors[idx * 3 + 1] = g;
            colors[idx * 3 + 2] = b;
            idx++;
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions.subarray(0, idx * 3), 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors.subarray(0, idx * 3), 3));

    const mat = new THREE.PointsMaterial({
        size           : 0.055,
        vertexColors   : true,
        transparent    : true,
        opacity        : 0.38,
        blending       : THREE.AdditiveBlending,
        depthWrite     : false,
        sizeAttenuation: true,
    });

    _points = new THREE.Points(geo, mat);
    scene.add(_points);
    return _points;
}

/** Show or hide the pressure volume. */
export function setPressureVolumeVisible(visible) {
    if (_points) _points.visible = visible;
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
}
