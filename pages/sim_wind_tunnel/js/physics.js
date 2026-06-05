/**
 * physics.js — pure velocity-field functions (no DOM, no THREE state).
 *
 * Model:
 *   • LBM velocity field (primary — real CFD, set after runLBM completes)
 *   • Pure uniform flow fallback when LBM has not yet run (live streamers)
 *   • Cd estimation from fineness ratio (empirical smooth-body data)
 */
import { VSIM } from './config.js';

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Compute the velocity vector at world-space point (px, py, pz).
 *
 * @param {number} px, py, pz  - sample position
 * @param {number} windMult    - multiplier on VSIM (visual speed slider)
 * @param {{ cx, cy, cz, r }|null} objSphere - effective bounding sphere; null = open stream
 * @returns {{ x: number, y: number, z: number }}
 */
export function getVelocity(px, py, pz, windMult, objSphere) {
    const U = VSIM * windMult;
    let vx = 0, vy = 0, vz = U;         // base uniform flow in +Z

    if (!objSphere) return { x: vx, y: vy, z: vz };

    const { cx, cy, cz, r: R } = objSphere;
    const dx = px - cx, dy = py - cy, dz = pz - cz;
    const r2 = dx*dx + dy*dy + dz*dz;

    // Inside the object: use the triangle-mesh voxel grid when available so the
    // boundary exactly matches the OBJ faces.  Fall back to per-component AABBs,
    // then merged AABB, then bounding-sphere for legacy / safety.
    let insideSolid;
    if (objSphere.voxels) {
        const vox = objSphere.voxels;
        const ix = Math.floor((px - vox.ox) / vox.step);
        const iy = Math.floor((py - vox.oy) / vox.step);
        const iz = Math.floor((pz - vox.oz) / vox.step);
        insideSolid = (ix >= 0 && iy >= 0 && iz >= 0 &&
                       ix < vox.nx && iy < vox.ny && iz < vox.nz &&
                       vox.data[ix + vox.nx * (iy + vox.ny * iz)] !== 0);
    } else if (objSphere.boxes) {
        insideSolid = objSphere.boxes.some(b =>
            Math.abs(px - b.cx) <= b.hx &&
            Math.abs(py - b.cy) <= b.hy &&
            Math.abs(pz - b.cz) <= b.hz
        );
    } else if (objSphere.hx !== undefined) {
        insideSolid = Math.abs(dx) <= objSphere.hx && Math.abs(dy) <= objSphere.hy && Math.abs(dz) <= objSphere.hz;
    } else {
        insideSolid = r2 < R * R * 0.96;
    }
    if (insideSolid) return { x: 0, y: 0, z: 0 };

    // ── LBM velocity field (real CFD — produced by lbm.worker.js) ────────────
    if (objSphere.lbmGrid) {
        const g  = objSphere.lbmGrid;
        // Convert world position to LBM cell coordinates.
        // Cell (ix, iy, iz) has its centre at (-TW/2 + (ix+0.5)*DX, …).
        // So fractional index = (world + half-tunnel-width) / DX − 0.5.
        const halfW = (g.NX * g.DX) / 2;
        const halfH = (g.NY * g.DX) / 2;
        const halfL = (g.NZ * g.DX) / 2;
        const fx = (px + halfW) / g.DX - 0.5;
        const fy = (py + halfH) / g.DX - 0.5;
        const fz = (pz + halfL) / g.DX - 0.5;

        const ix0 = Math.floor(fx), iy0 = Math.floor(fy), iz0 = Math.floor(fz);
        const tx  = fx - ix0, ty = fy - iy0, tz = fz - iz0;

        const NX = g.NX, NY = g.NY;
        const clampX = v => v < 0 ? 0 : v >= NX ? NX - 1 : v;
        const clampY = v => v < 0 ? 0 : v >= NY ? NY - 1 : v;
        const clampZ = v => v < 0 ? 0 : v >= g.NZ ? g.NZ - 1 : v;

        const cx0 = clampX(ix0), cx1 = clampX(ix0 + 1);
        const cy0 = clampY(iy0), cy1 = clampY(iy0 + 1);
        const cz0 = clampZ(iz0), cz1 = clampZ(iz0 + 1);

        const c000 = cx0 + NX * (cy0 + NY * cz0);
        const c100 = cx1 + NX * (cy0 + NY * cz0);
        const c010 = cx0 + NX * (cy1 + NY * cz0);
        const c110 = cx1 + NX * (cy1 + NY * cz0);
        const c001 = cx0 + NX * (cy0 + NY * cz1);
        const c101 = cx1 + NX * (cy0 + NY * cz1);
        const c011 = cx0 + NX * (cy1 + NY * cz1);
        const c111 = cx1 + NX * (cy1 + NY * cz1);

        const w000 = (1-tx)*(1-ty)*(1-tz), w100 = tx*(1-ty)*(1-tz);
        const w010 = (1-tx)*   ty *(1-tz), w110 = tx*   ty *(1-tz);
        const w001 = (1-tx)*(1-ty)*   tz,  w101 = tx*(1-ty)*   tz;
        const w011 = (1-tx)*   ty *   tz,  w111 = tx*   ty *   tz;

        const ivx = w000*g.vx[c000] + w100*g.vx[c100] + w010*g.vx[c010] + w110*g.vx[c110]
                  + w001*g.vx[c001] + w101*g.vx[c101] + w011*g.vx[c011] + w111*g.vx[c111];
        const ivy = w000*g.vy[c000] + w100*g.vy[c100] + w010*g.vy[c010] + w110*g.vy[c110]
                  + w001*g.vy[c001] + w101*g.vy[c101] + w011*g.vy[c011] + w111*g.vy[c111];
        const ivz = w000*g.vz[c000] + w100*g.vz[c100] + w010*g.vz[c010] + w110*g.vz[c110]
                  + w001*g.vz[c001] + w101*g.vz[c101] + w011*g.vz[c011] + w111*g.vz[c111];

        // vx/vy/vz are normalised to U_IN=1; multiply by U to get world velocity.
        return { x: U * ivx, y: U * ivy, z: U * ivz };
    }

    // ── Uniform-flow fallback (LBM not yet run — live streamers only) ─────────
    // No analytical perturbations; all objects are treated identically.
    return { x: vx, y: vy, z: vz };
}

/**
 * Estimate drag coefficient Cd from fineness ratio.
 * f = streamwise_length / sqrt(frontal_area)
 * Fitted to empirical data for smooth, convex axisymmetric bodies.
 */
export function estimateCd(f) {
    if (f <= 0.25) return 1.17;
    if (f <= 0.5)  return lerp(1.17, 0.90, (f - 0.25) / 0.25);
    if (f <= 1.0)  return lerp(0.90, 0.47, (f - 0.5)  / 0.5 );
    if (f <= 2.0)  return lerp(0.47, 0.28, (f - 1.0)  / 1.0 );
    if (f <= 4.0)  return lerp(0.28, 0.12, (f - 2.0)  / 2.0 );
    if (f <= 8.0)  return lerp(0.12, 0.05, (f - 4.0)  / 4.0 );
    return 0.04;
}
