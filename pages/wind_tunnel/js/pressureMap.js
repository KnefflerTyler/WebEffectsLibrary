/**
 * pressureMap.js — builds a simulation-derived Cp surface texture.
 *
 * After the multi-pass simulation runs, each particle path carries a local
 * speed ratio  ss[j] = |v|/U.  From that we get the pressure coefficient:
 *
 *   Cp = 1 − (|v|/U)²
 *
 * We project those Cp samples onto a 128×64 equirectangular map whose UV
 * coordinates are:
 *   u (0→1)  = longitude φ = atan2(dx, dz) / 2π + 0.5   (XZ plane, 0 = +Z upstream)
 *   v (0→1)  = colatitude θ = acos(dy) / π               (0 = +Y top, 1 = −Y bottom)
 *
 * This matches the UV lookup in object.frag.glsl exactly.
 *
 * Cells not sampled by the simulation keep the analytical potential-flow
 * value so there are no holes.
 */
import * as THREE from 'three';
import { TW, TH, TL } from './config.js';

const MAP_W      = 128;   // longitude cells
const MAP_H      = 64;    // colatitude cells
const SHELL_MIN  = 1.00;  // inner radius factor (surface)
const SHELL_MAX  = 3.00;  // outer radius factor (thin sampling shell)
const TWO_PI     = Math.PI * 2;

let _texture = null;

/**
 * Build a DataTexture from the provided simulation paths.
 * Each texel stores Cp mapped to [0,1] in the R channel
 * (0 = deep blue / −1.25, 0.556 = white / 0, 1 = red / +1.0).
 *
 * @param {Array<{xs,ys,zs,ss}>} paths3d
 * @param {{ cx, cy, cz, r }}    objSphere
 * @returns {THREE.DataTexture}
 */
export function buildPressureMap(paths3d, objSphere) {
    if (!objSphere || !paths3d?.length) return null;
    const { cx, cy, cz, r } = objSphere;

    const cpSum = new Float32Array(MAP_W * MAP_H);
    const cpCnt = new Float32Array(MAP_W * MAP_H);

    const rMin2 = (r * SHELL_MIN) ** 2;
    const rMax2 = (r * SHELL_MAX) ** 2;

    for (const { xs, ys, zs, ss } of paths3d) {
        for (let j = 0; j < xs.length; j++) {
            const dx = xs[j] - cx;
            const dy = ys[j] - cy;
            const dz = zs[j] - cz;
            const d2 = dx * dx + dy * dy + dz * dz;

            if (d2 < rMin2 || d2 > rMax2) continue;

            const d  = Math.sqrt(d2);
            const nx = dx / d;
            const ny = dy / d;
            const nz = dz / d;

            // Spherical UV — must match the GLSL lookup in object.frag.glsl
            const phi   = Math.atan2(nx, nz) / TWO_PI + 0.5;          // [0,1] longitude
            const theta = Math.acos(Math.max(-1, Math.min(1, ny))) / Math.PI; // [0,1] colatitude

            const u   = Math.floor(phi   * MAP_W) % MAP_W;
            const v   = Math.floor(theta * MAP_H) % MAP_H;
            const idx = v * MAP_W + u;

            const s  = ss[j];
            const Cp = 1.0 - s * s;   // Cp = 1 − (|v|/U)²  ∈ [−∞, +1]
            cpSum[idx] += Cp;
            cpCnt[idx]++;
        }
    }

    // ── Build RGBA Uint8 texture ───────────────────────────────────────────────
    // R channel: Cp normalised to [0,1].  Empty cells use the analytical formula.
    const data = new Uint8Array(MAP_W * MAP_H * 4);

    for (let v = 0; v < MAP_H; v++) {
        for (let u = 0; u < MAP_W; u++) {
            const idx = v * MAP_W + u;
            let cp;

            if (cpCnt[idx] > 0) {
                cp = cpSum[idx] / cpCnt[idx];
            } else {
                // Analytical fallback: Cp(θ) = (9/4)cos²θ − 5/4
                // We reconstruct the local direction from (u, v) and apply
                // the same cosT = −dir.z convention used in the shader.
                const thetaRad = (v / MAP_H) * Math.PI;
                const phiRad   = (u / MAP_W - 0.5) * TWO_PI;
                // dir.z = sin(θ)·cos(φ) in our spherical convention
                const cosT = -Math.sin(thetaRad) * Math.cos(phiRad);
                cp = 2.25 * cosT * cosT - 1.25;
            }

            // Map Cp ∈ [−1.25, +1.0] → byte [0, 255]
            const t    = Math.max(0, Math.min(1, (cp + 1.25) / 2.25));
            const byte = Math.round(t * 255);

            data[idx * 4 + 0] = byte;
            data[idx * 4 + 1] = byte;
            data[idx * 4 + 2] = byte;
            data[idx * 4 + 3] = 255;
        }
    }

    if (_texture) _texture.dispose();

    _texture = new THREE.DataTexture(data, MAP_W, MAP_H);
    _texture.minFilter  = THREE.LinearFilter;
    _texture.magFilter  = THREE.LinearFilter;
    _texture.wrapS      = THREE.RepeatWrapping;   // phi wraps continuously
    _texture.wrapT      = THREE.ClampToEdgeWrapping;
    _texture.needsUpdate = true;

    return _texture;
}

/** Returns the current pressure map texture, or null. */
export function getPressureTexture() {
    return _texture;
}

/** Dispose and clear the texture. */
export function disposePressureMap() {
    if (_texture) { _texture.dispose(); _texture = null; }
}

// ── Pressure plane map (flat XZ grid) ────────────────────────────────────────
// Resolution proportional to tunnel footprint (TW × TL).
const PLANE_W = 128;   // cells along X  (maps world -TW/2 … +TW/2)
const PLANE_Z = 180;   // cells along Z  (maps world -TL/2 … +TL/2)

// Y tolerance: include path points within this fraction of TH of the plane Y.
const SLICE_HALF = TH * 0.35;

let _planeTexture = null;

/**
 * Build a flat XZ Cp texture from simulation paths, for the pressure plane.
 *
 * UV convention (must match pressure.frag.glsl):
 *   u = (worldX + TW/2) / TW   →  0 = left wall,  1 = right wall
 *   v = (worldZ + TL/2) / TL   →  0 = inlet face,  1 = outlet face
 *
 * @param {Array<{xs,ys,zs,ss}>} paths3d
 * @param {{ cx, cy, cz, r }}    objSphere
 * @returns {THREE.DataTexture}
 */
export function buildPressurePlaneMap(paths3d, objSphere) {
    if (!paths3d?.length) return null;

    const planeY = objSphere?.cy ?? 0;

    const cpSum = new Float32Array(PLANE_W * PLANE_Z);
    const cpCnt = new Float32Array(PLANE_W * PLANE_Z);

    for (const { xs, ys, zs, ss } of paths3d) {
        for (let j = 0; j < xs.length; j++) {
            if (Math.abs(ys[j] - planeY) > SLICE_HALF) continue;

            const u   = (xs[j] + TW * 0.5) / TW;
            const v   = (zs[j] + TL * 0.5) / TL;
            const pu  = Math.floor(u * PLANE_W);
            const pv  = Math.floor(v * PLANE_Z);
            if (pu < 0 || pu >= PLANE_W || pv < 0 || pv >= PLANE_Z) continue;

            const idx = pv * PLANE_W + pu;
            const s   = ss[j];
            cpSum[idx] += 1.0 - s * s;   // Cp = 1 − (|v|/U)²
            cpCnt[idx]++;
        }
    }

    const data = new Uint8Array(PLANE_W * PLANE_Z * 4);

    for (let pv = 0; pv < PLANE_Z; pv++) {
        for (let pu = 0; pu < PLANE_W; pu++) {
            const idx = pv * PLANE_W + pu;
            let cp;

            if (cpCnt[idx] > 0) {
                cp = cpSum[idx] / cpCnt[idx];
            } else {
                // Analytical fallback: potential-flow Cp at this XZ cell, Y = planeY
                const wx = (pu / PLANE_W) * TW - TW * 0.5;
                const wz = (pv / PLANE_Z) * TL - TL * 0.5;
                if (objSphere) {
                    const dx = wx - objSphere.cx;
                    const dy = planeY - objSphere.cy;
                    const dz = wz - objSphere.cz;
                    const r2 = dx*dx + dy*dy + dz*dz;
                    if (r2 < objSphere.r * objSphere.r) {
                        cp = 0;  // inside object — neutral
                    } else {
                        const r  = Math.sqrt(r2);
                        const R3 = objSphere.r ** 3;
                        const A  = R3 / (2 * r ** 3);
                        const B  = 3 * R3 / (2 * r ** 5);
                        const vz_n = 1 + A - B * dz * dz;
                        const vx_n =       -B * dz * dx;
                        const vy_n =       -B * dz * dy;
                        cp = 1 - (vx_n*vx_n + vy_n*vy_n + vz_n*vz_n);
                    }
                } else {
                    cp = 0;  // no object — neutral freestream
                }
            }

            const t    = Math.max(0, Math.min(1, (cp + 1.25) / 2.25));
            const byte = Math.round(t * 255);
            data[idx * 4 + 0] = byte;
            data[idx * 4 + 1] = byte;
            data[idx * 4 + 2] = byte;
            data[idx * 4 + 3] = 255;
        }
    }

    if (_planeTexture) _planeTexture.dispose();

    _planeTexture = new THREE.DataTexture(data, PLANE_W, PLANE_Z);
    _planeTexture.minFilter   = THREE.LinearFilter;
    _planeTexture.magFilter   = THREE.LinearFilter;
    _planeTexture.wrapS       = THREE.ClampToEdgeWrapping;
    _planeTexture.wrapT       = THREE.ClampToEdgeWrapping;
    _planeTexture.needsUpdate = true;

    return _planeTexture;
}

/** Returns the current pressure plane texture, or null. */
export function getPlaneCpTexture() {
    return _planeTexture;
}

/** Dispose and clear the plane texture. */
export function disposePressurePlaneMap() {
    if (_planeTexture) { _planeTexture.dispose(); _planeTexture = null; }
}
