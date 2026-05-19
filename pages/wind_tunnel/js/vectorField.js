/**
 * vectorField.js — PIV-style velocity vector field overlay.
 *
 * Renders a regular grid of arrow glyphs in the horizontal mid-plane (Y = 0)
 * of the wind tunnel. Each arrow shows:
 *   • Direction — the velocity vector at that grid point
 *   • Length    — proportional to speed (capped for readability)
 *   • Color     — speed-ramp matching the streamer colour scheme
 *       0× U → deep blue (stagnation)
 *       1× U → green (freestream)
 *       2× U → red (accelerated suction flow)
 *
 * Each arrow = 3 LINE_SEGMENTS pairs (6 vertices):
 *   [0,1] stem from base to tip
 *   [2,3] left arrowhead barb
 *   [4,5] right arrowhead barb
 *
 * This is analogous to PIV (Particle Image Velocimetry) output or the vector
 * plots produced by CFD post-processors such as ParaView / OpenFOAM.
 *
 * Usage:
 *   import { setVectorFieldVisible, updateVectorField } from './vectorField.js';
 *
 *   // In animation loop (only updates buffers when visible):
 *   updateVectorField(totalTime, windMult, getObjSphere());
 *
 *   // Toggle via checkbox:
 *   setVectorFieldVisible(true);
 */
import * as THREE from 'three';
import { TW, TL, VSIM } from './config.js';
import { getVelocity }  from './physics.js';
import { scene }        from './scene.js';

// ── Grid parameters ───────────────────────────────────────────────────────────
const N_COL  = 20;          // arrows along Z (flow direction)
const N_ROW  = 13;          // arrows along X (tunnel width)
const Y_PLANE = 0.0;        // horizontal mid-plane height

// Arrow scaling — MAX_LEN is the arrow length when speed = 2× freestream
const MAX_LEN  = 0.55;
const BARB_T   = 0.28;      // barb root at this fraction back from tip
const BARB_W   = 0.18;      // barb lateral width as fraction of arrow length

// ── Per-arrow vertex counts ───────────────────────────────────────────────────
const VERTS_PER_ARROW = 6;           // 3 line-segment pairs
const N_ARROWS        = N_COL * N_ROW;
const N_VERTS         = N_ARROWS * VERTS_PER_ARROW;

// ── GPU buffers ───────────────────────────────────────────────────────────────
const positions = new Float32Array(N_VERTS * 3);
const colors    = new Float32Array(N_VERTS * 3);

const geo     = new THREE.BufferGeometry();
const posAttr = new THREE.BufferAttribute(positions, 3);
const colAttr = new THREE.BufferAttribute(colors,    3);
posAttr.usage = THREE.DynamicDrawUsage;
colAttr.usage = THREE.DynamicDrawUsage;
geo.setAttribute('position', posAttr);
geo.setAttribute('color',    colAttr);

const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent : true,
    opacity     : 0.85,
    depthWrite  : false,
});

const lines = new THREE.LineSegments(geo, mat);
lines.visible = false;
scene.add(lines);

// ── Colour ramp (mirrors streamer GLSL speed → colour) ────────────────────────
const lerp = (a, b, t) => a + (b - a) * t;

function speedColor(s) {
    s = Math.max(0, Math.min(2, s));
    let r, g, b;
    if (s < 0.5) {
        const t = s * 2;
        r = lerp(0.08, 0.07, t); g = lerp(0.18, 0.85, t); b = lerp(0.90, 0.95, t);
    } else if (s < 1.0) {
        const t = (s - 0.5) * 2;
        r = lerp(0.07, 0.10, t); g = lerp(0.85, 0.90, t); b = lerp(0.95, 0.25, t);
    } else if (s < 1.5) {
        const t = (s - 1.0) * 2;
        r = lerp(0.10, 0.95, t); g = lerp(0.90, 0.85, t); b = lerp(0.25, 0.10, t);
    } else {
        const t = (s - 1.5) * 2;
        r = lerp(0.95, 0.95, t); g = lerp(0.85, 0.10, t); b = lerp(0.10, 0.08, t);
    }
    return [r, g, b];
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Show or hide the vector field overlay. */
export function setVectorFieldVisible(visible) {
    lines.visible = visible;
}

/**
 * Recompute and upload arrow positions and colours for the current flow state.
 * Skips all work when the overlay is hidden (no CPU cost when off).
 *
 * @param {number} t          - simulation time in seconds (for vortex shedding phase)
 * @param {number} windMult   - visual speed multiplier from UI
 * @param {{ cx,cy,cz,r }|null} objSphere
 */
export function updateVectorField(t, windMult, objSphere) {
    if (!lines.visible) return;

    const U = VSIM * windMult;

    for (let row = 0; row < N_ROW; row++) {
        const gx = lerp(-TW * 0.46, TW * 0.46, N_ROW > 1 ? row / (N_ROW - 1) : 0.5);

        for (let col = 0; col < N_COL; col++) {
            const gz = lerp(-TL * 0.46, TL * 0.46, N_COL > 1 ? col / (N_COL - 1) : 0.5);

            const vel  = getVelocity(gx, Y_PLANE, gz, t, windMult, objSphere);
            const vmag = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
            const speed = U > 0 ? vmag / U : 1.0;

            // Arrow length proportional to speed, capped at MAX_LEN.
            // Dividing by 1.5 instead of 2.0 makes freestream arrows fill ~67 %
            // of MAX_LEN, leaving visible headroom for accelerated regions.
            const len = MAX_LEN * Math.min(speed / 1.5, 1.0);

            // Unit direction vector along the velocity — scale to arrow length.
            // Fall back to a tiny +Z stub at stagnation points to mark their location.
            let ex, ey, ez;
            if (vmag > 1e-5) {
                const inv = len / vmag;
                ex = vel.x * inv;
                ey = vel.y * inv;
                ez = vel.z * inv;
            } else {
                ex = 0; ey = 0; ez = len * 0.05;  // tiny indicator at stagnation
            }

            // Tip position (base is at grid point on Y_PLANE)
            const tipX = gx + ex;
            const tipY = Y_PLANE + ey;
            const tipZ = gz  + ez;

            // ── Arrowhead barbs ───────────────────────────────────────────────
            // The barbs are two line-segments that meet at the tip.  Each barb
            // root lies BARB_T of the arrow length back from the tip, and the
            // roots are displaced ±BARB_W laterally in the XZ plane (perpendicular
            // to the horizontal projection of the arrow direction).
            //
            //   bRootX/Z = tip − stem * BARB_T       (offset back along stem)
            //   bx/bz    = perpendicular unit ± scaled by BARB_W × len
            const hLen = Math.sqrt(ex * ex + ez * ez);
            let bx, bz;
            if (hLen > 1e-4) {
                const bScale = len * BARB_W / hLen;
                bx = -ez * bScale;   // rotate 90° in XZ plane
                bz =  ex * bScale;
            } else {
                bx = len * BARB_W; bz = 0;  // vertical arrow: barb along X
            }

            // Barb root (along the stem, offset back from tip)
            const bRootX = tipX - ex * BARB_T;
            const bRootY = tipY - ey * BARB_T;
            const bRootZ = tipZ - ez * BARB_T;

            // Vertex base index in the flat buffers
            const arrowIdx = row * N_COL + col;
            const vi = arrowIdx * VERTS_PER_ARROW;
            const pi = vi * 3;

            // ── Stem ─────────────────────────────────────────────────────────
            positions[pi    ] = gx;   positions[pi + 1] = Y_PLANE; positions[pi + 2] = gz;
            positions[pi + 3] = tipX; positions[pi + 4] = tipY;    positions[pi + 5] = tipZ;

            // ── Left barb ─────────────────────────────────────────────────────
            positions[pi + 6] = bRootX + bx; positions[pi +  7] = bRootY; positions[pi +  8] = bRootZ + bz;
            positions[pi + 9] = tipX;        positions[pi + 10] = tipY;   positions[pi + 11] = tipZ;

            // ── Right barb ────────────────────────────────────────────────────
            positions[pi + 12] = bRootX - bx; positions[pi + 13] = bRootY; positions[pi + 14] = bRootZ - bz;
            positions[pi + 15] = tipX;         positions[pi + 16] = tipY;   positions[pi + 17] = tipZ;

            // ── Colour (same for all 6 vertices of this arrow) ────────────────
            const [cr, cg, cb] = speedColor(speed);
            const ci = vi * 3;
            for (let k = 0; k < 6; k++) {
                colors[ci + k * 3    ] = cr;
                colors[ci + k * 3 + 1] = cg;
                colors[ci + k * 3 + 2] = cb;
            }
        }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
}
