/**
 * streamers.js — continuous streamline visualisation.
 *
 * Each streamer is a single THREE.Line whose N_STEPS vertices trace a
 * streamline integrated from the tunnel inlet (z = -TL/2) to the outlet
 * using arc-length stepping.  The line is re-integrated every frame so
 * turbulent fluctuations in the wake are visible.
 *
 * GPU changes:
 *   • aTrailT attribute removed (no longer a moving particle trail).
 *   • Proximity uniforms (uObjCenter, uObjRadius, uFadeMult) control which
 *     portions of each streamline are visible — only the region close to the
 *     object is rendered; far straight sections are discarded in the shader.
 *   • Per-frame upload: positions (3 f32) + aSpeed (1 f32) = 4 f32 / vertex.
 */
import * as THREE from 'three';
import { TW, TH, TL, VSIM, N_STEPS } from './config.js';
import { STREAMER_VERT, STREAMER_FRAG } from './shaders.js';
import { getVelocity } from './physics.js';
import { scene } from './scene.js';

// Arc-length step: generous enough to reach TL * 1.6 in N_STEPS iterations,
// which covers curved paths that loop around the object.
const DS = (TL * 1.6) / (N_STEPS - 1);

// ── Shared shader material ────────────────────────────────────────────────────
const streamerMat = new THREE.ShaderMaterial({
    vertexShader  : STREAMER_VERT,
    fragmentShader: STREAMER_FRAG,
    uniforms: {
        uObjCenter: { value: new THREE.Vector3(0, 0, 0) },
        uObjRadius: { value: 0.0 },   // 0 → no object → show full streamlines
        uFadeMult : { value: 3.0 },   // visible up to this many radii from surface
    },
    transparent: true,
    blending   : THREE.AdditiveBlending,
    depthWrite : false,
});

// ── Module state ──────────────────────────────────────────────────────────────
const streamerGroup = new THREE.Group();
scene.add(streamerGroup);

let streamers = [];
let simTime   = 0;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * (Re)build the streamer grid with nX columns × nY rows.
 * Call after any change to the grid dimensions.
 */
export function buildStreamers(nX, nY) {
    streamerGroup.clear();
    streamers = [];

    for (let iy = 0; iy < nY; iy++) {
        for (let ix = 0; ix < nX; ix++) {
            const x0 = lerp(-TW / 2 + 0.7, TW / 2 - 0.7, nX > 1 ? ix / (nX - 1) : 0.5);
            const y0 = lerp(-TH / 2 + 0.35, TH / 2 - 0.35, nY > 1 ? iy / (nY - 1) : 0.5);

            const positions = new Float32Array(N_STEPS * 3);
            const speeds    = new Float32Array(N_STEPS);

            // Initialise with a straight line along Z — overwritten on first frame
            for (let i = 0; i < N_STEPS; i++) {
                positions[i * 3]     = x0;
                positions[i * 3 + 1] = y0;
                positions[i * 3 + 2] = lerp(-TL / 2, TL / 2, i / (N_STEPS - 1));
                speeds[i] = 1.0;
            }

            const geo     = new THREE.BufferGeometry();
            const posAttr = new THREE.BufferAttribute(positions, 3);
            const spdAttr = new THREE.BufferAttribute(speeds,    1);
            posAttr.usage = THREE.DynamicDrawUsage;
            spdAttr.usage = THREE.DynamicDrawUsage;
            geo.setAttribute('position', posAttr);
            geo.setAttribute('aSpeed',   spdAttr);

            const line = new THREE.Line(geo, streamerMat);
            streamerGroup.add(line);
            streamers.push({ positions, speeds, posAttr, spdAttr, x0, y0 });
        }
    }
}

/**
 * Re-integrate every streamline from the inlet using the current velocity field.
 * Call once per animation frame while the simulation is running.
 *
 * @param {number} dt        - delta-time in seconds (used to advance simTime for turbulence)
 * @param {number} windMult  - visual speed multiplier from UI
 * @param {{ cx,cy,cz,r }|null} objSphere
 */
export function advanceStreamers(dt, windMult, objSphere) {
    simTime += dt;

    // ── Update proximity uniforms ─────────────────────────────────────────────
    if (objSphere) {
        streamerMat.uniforms.uObjCenter.value.set(objSphere.cx, objSphere.cy, objSphere.cz);
        streamerMat.uniforms.uObjRadius.value = objSphere.r;
    } else {
        streamerMat.uniforms.uObjRadius.value = 0.0;
    }

    const U = VSIM * windMult;

    for (const s of streamers) {
        const { positions: pos, speeds: spd, posAttr, spdAttr } = s;

        let x = s.x0, y = s.y0, z = -TL / 2;

        for (let i = 0; i < N_STEPS; i++) {
            pos[i * 3]     = x;
            pos[i * 3 + 1] = y;
            pos[i * 3 + 2] = z;

            const v    = getVelocity(x, y, z, simTime, windMult, objSphere);
            const vmag = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
            spd[i] = U > 0 ? vmag / U : 1.0;

            // Stagnation point: nudge gently forward along Z to avoid locking
            if (vmag < 1e-4) {
                z += DS * 0.05;
                continue;
            }

            // Arc-length step in velocity direction
            const inv = DS / vmag;
            x += v.x * inv;
            y += v.y * inv;
            z += v.z * inv;

            // Exited tunnel bounds — fill remaining vertices with last position
            if (z > TL / 2 + 0.6 ||
                Math.abs(x) > TW / 2 + 0.4 ||
                Math.abs(y) > TH / 2 + 0.4) {
                for (let j = i + 1; j < N_STEPS; j++) {
                    pos[j * 3]     = x;
                    pos[j * 3 + 1] = y;
                    pos[j * 3 + 2] = z;
                    spd[j]         = spd[i];
                }
                break;
            }
        }

        posAttr.needsUpdate = true;
        spdAttr.needsUpdate = true;
    }
}

/**
 * Update the fade-range uniform (called by UI slider).
 * @param {number} mult  visible radius = objRadius * mult
 */
export function setVisibilityRange(mult) {
    streamerMat.uniforms.uFadeMult.value = mult;
}

// ── Utility ───────────────────────────────────────────────────────────────────
const lerp = (a, b, t) => a + (b - a) * t;

