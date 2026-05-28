/**
 * physics.js — pure velocity-field functions (no DOM, no THREE state).
 *
 * Model:
 *   • Exact potential-flow solution for a sphere (doublet + uniform +Z flow)
 *   • Simplified wake-deficit model downstream of the sphere centre
 *   • Cd estimation from fineness ratio (empirical smooth-body data)
 */
import { VSIM } from './config.js';

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Compute the velocity vector at world-space point (px, py, pz).
 *
 * @param {number} px, py, pz  - sample position
 * @param {number} t           - simulation time in seconds (for turbulence phase)
 * @param {number} windMult    - multiplier on VSIM (visual speed slider)
 * @param {{ cx, cy, cz, r }|null} objSphere - effective bounding sphere; null = open stream
 * @returns {{ x: number, y: number, z: number }}
 */
export function getVelocity(px, py, pz, t, windMult, objSphere) {
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

    if (objSphere.panelGrid) {
        // ── BEM panel velocity grid — topology-correct for any mesh ──────────
        // Trilinear interpolation from the precomputed source-panel grid.
        // The grid was solved from the mesh's actual triangles, so it respects
        // every geometric feature: holes, gaps, cutouts, thin walls.
        // No per-shape branches needed — the torus hole, for example, naturally
        // shows (near-)freestream through-flow because the ring of source panels
        // produces zero net z-perturbation at the hole centre.
        const g  = objSphere.panelGrid;
        const G  = g.nx;    // same for all three axes
        const G2 = G * G;

        const fx  = (px - g.ox) / g.dx - 0.5;
        const fy  = (py - g.oy) / g.dy - 0.5;
        const fz  = (pz - g.oz) / g.dz - 0.5;
        const ix0 = Math.floor(fx), iy0 = Math.floor(fy), iz0 = Math.floor(fz);
        const tx  = fx - ix0,  ty = fy - iy0,  tz = fz - iz0;
        const ix1 = ix0 + 1,  iy1 = iy0 + 1,  iz1 = iz0 + 1;

        // Clamped voxel indices (inlined — avoids closure allocation in hot path)
        const cix0 = ix0 < 0 ? 0 : ix0 >= G ? G-1 : ix0;
        const cix1 = ix1 < 0 ? 0 : ix1 >= G ? G-1 : ix1;
        const ciy0 = iy0 < 0 ? 0 : iy0 >= G ? G-1 : iy0;
        const ciy1 = iy1 < 0 ? 0 : iy1 >= G ? G-1 : iy1;
        const ciz0 = iz0 < 0 ? 0 : iz0 >= G ? G-1 : iz0;
        const ciz1 = iz1 < 0 ? 0 : iz1 >= G ? G-1 : iz1;

        const c000 = cix0 + G * ciy0 + G2 * ciz0;
        const c100 = cix1 + G * ciy0 + G2 * ciz0;
        const c010 = cix0 + G * ciy1 + G2 * ciz0;
        const c110 = cix1 + G * ciy1 + G2 * ciz0;
        const c001 = cix0 + G * ciy0 + G2 * ciz1;
        const c101 = cix1 + G * ciy0 + G2 * ciz1;
        const c011 = cix0 + G * ciy1 + G2 * ciz1;
        const c111 = cix1 + G * ciy1 + G2 * ciz1;

        const w000 = (1-tx)*(1-ty)*(1-tz), w100 = tx*(1-ty)*(1-tz);
        const w010 = (1-tx)*   ty *(1-tz), w110 = tx*   ty *(1-tz);
        const w001 = (1-tx)*(1-ty)*   tz,  w101 = tx*(1-ty)*   tz;
        const w011 = (1-tx)*   ty *   tz,  w111 = tx*   ty *   tz;

        vx += U * (w000*g.vx[c000] + w100*g.vx[c100] + w010*g.vx[c010] + w110*g.vx[c110]
                 + w001*g.vx[c001] + w101*g.vx[c101] + w011*g.vx[c011] + w111*g.vx[c111]);
        vy += U * (w000*g.vy[c000] + w100*g.vy[c100] + w010*g.vy[c010] + w110*g.vy[c110]
                 + w001*g.vy[c001] + w101*g.vy[c101] + w011*g.vy[c011] + w111*g.vy[c111]);
        vz += U * (w000*g.vz[c000] + w100*g.vz[c100] + w010*g.vz[c010] + w110*g.vz[c110]
                 + w001*g.vz[c001] + w101*g.vz[c101] + w011*g.vz[c011] + w111*g.vz[c111]);

    } else {
        // ── Fallback: ellipsoidal doublet (no BEM data available) ────────────
        const Rx = objSphere.hx || R;
        const Ry = objSphere.hy || R;
        const Rz = objSphere.hz || R;
        const ex = dx / Rx, ey = dy / Ry, ez = dz / Rz;
        const rn2 = ex*ex + ey*ey + ez*ez;
        const rn  = Math.max(Math.sqrt(rn2), 1e-6);
        const rn3 = rn2 * rn, rn5 = rn3 * rn2;
        vz += U * ( 1.0 / (2.0 * rn3) - 3.0 * ez * ez   / (2.0 * rn5) );
        vx -= U * 3.0 * dx * dz / ( 2.0 * rn5 * Rx * Rx );
        vy -= U * 3.0 * dy * dz / ( 2.0 * rn5 * Ry * Ry );
    }

    // ── Wake deficit ──────────────────────────────────────────────────────────
    // A voxel probe at the object's centre Z-plane determines whether solid
    // material actually blocks the flow at this (x,y) position.  This
    // naturally excludes holes and openings from the wake — the torus hole,
    // an arch, or any gap shows no wake deficit without any shape-specific code.
    if (dz > 0) {
        let blocked = true;
        if (objSphere.voxels) {
            const vox = objSphere.voxels;
            const uix = Math.floor((px - vox.ox) / vox.step);
            const uiy = Math.floor((py - vox.oy) / vox.step);
            const uiz = Math.floor((cz - vox.oz) / vox.step);  // object mid-Z
            blocked = (uix >= 0 && uiy >= 0 && uiz >= 0 &&
                       uix < vox.nx && uiy < vox.ny && uiz < vox.nz &&
                       vox.data[uix + vox.nx * (uiy + vox.ny * uiz)] !== 0);
        }
        if (blocked) {
            const wR     = Math.sqrt(dx*dx + dy*dy);
            const Rx     = objSphere.hx || R;
            const Ry     = objSphere.hy || R;
            const Rcs    = Math.sqrt(Rx * Ry);
            const wWidth = Rcs * (1.0 + 0.45 * dz / Rcs);
            if (wR < wWidth) {
                const fDecay  = Math.exp(-dz / (3.8 * Rcs));
                const fRadial = Math.exp(-2.0 * wR * wR / (wWidth * wWidth));
                vz -= U * 0.50 * fDecay * fRadial;
                const St    = 0.21;
                const omega = Math.PI * St * U / Rcs;
                const k_z   = omega / (0.85 * U);
                const phase = omega * t - k_z * dz;
                const shedAmp = U * 0.13 * fDecay * fRadial;
                vy += shedAmp * Math.sin(phase);
                vx += shedAmp * 0.40 * Math.cos(phase);
                const turb = U * 0.025 * fDecay * fRadial;
                vx += turb * Math.sin(t * 7.1 + dx * 4.3 + dz * 2.9);
                vy += turb * Math.cos(t * 6.3 + dy * 5.1 + dz * 3.3);
            }
        }
    }

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
