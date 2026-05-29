/**
 * lbm.worker.js — D3Q19 BGK Lattice-Boltzmann CFD solver (WebWorker).
 *
 * Runs the full LBM solve on a dedicated thread so the main thread stays
 * responsive.  Receives the solid-voxel mask via postMessage, posts progress
 * updates, then transfers the converged velocity field back (zero-copy via
 * ArrayBuffer transfer).
 *
 * Physics
 * ───────
 *  • D3Q19 lattice (19 velocity directions in 3-D)
 *  • BGK single-relaxation-time collision operator
 *  • Mid-link bounce-back at all solid/wall boundaries
 *  • Inlet  (z = 0)      : forced equilibrium at U_IN
 *  • Outlet (z = NZ−1)   : zero-gradient (copy from z = NZ−2)
 *  • X/Y walls           : bounce-back (no-slip)
 *
 * Output velocity is normalised by U_IN so that freestream = (0, 0, 1).
 * physics.js multiplies by VSIM * windMult at query time.
 */
import { TW, TH, TL } from './config.js';

// ── Grid ──────────────────────────────────────────────────────────────────────
const NX = 40;            // cells along X  (TW = 10 → 0.25 world-units/cell)
const NY = 20;            // cells along Y  (TH =  5 → 0.25)
const NZ = 56;            // cells along Z  (TL = 14 → 0.25)
const N  = NX * NY * NZ; // 44 800 cells total
const DX = TW / NX;      // 0.25 world units per cell (uniform)

// ── LBM parameters ────────────────────────────────────────────────────────────
const U_IN  = 0.12;              // inlet speed in lattice units (Mach ≈ 0.21)
const TAU   = 0.55;              // relaxation time  →  ν = (τ−0.5)/3 ≈ 0.017
                                 // Re = U_IN × D_cells / ν ≈ 0.12×11/0.017 ≈ 78
const OMEGA = 1.0 / TAU;

// ── D3Q19 velocity set ────────────────────────────────────────────────────────
//
//  q   (ex, ey, ez)    weight        opposite
//  ─────────────────────────────────────────────
//  0   ( 0, 0, 0)      12/36          0
//  1   (+1, 0, 0)       2/36          2
//  2   (-1, 0, 0)       2/36          1
//  3   ( 0,+1, 0)       2/36          4
//  4   ( 0,-1, 0)       2/36          3
//  5   ( 0, 0,+1)       2/36          6   ← +Z = downstream
//  6   ( 0, 0,-1)       2/36          5
//  7   (+1,+1, 0)       1/36         10
//  8   (-1,+1, 0)       1/36          9
//  9   (+1,-1, 0)       1/36          8
// 10   (-1,-1, 0)       1/36          7
// 11   (+1, 0,+1)       1/36         14
// 12   (-1, 0,+1)       1/36         13
// 13   (+1, 0,-1)       1/36         12
// 14   (-1, 0,-1)       1/36         11
// 15   ( 0,+1,+1)       1/36         18
// 16   ( 0,-1,+1)       1/36         17
// 17   ( 0,+1,-1)       1/36         16
// 18   ( 0,-1,-1)       1/36         15

const NQ = 19;
/* eslint-disable no-multi-spaces */
const EX  = new Int8Array ([0, 1,-1, 0, 0, 0, 0,  1,-1, 1,-1,  1,-1, 1,-1,  0, 0, 0, 0]);
const EY  = new Int8Array ([0, 0, 0, 1,-1, 0, 0,  1, 1,-1,-1,  0, 0, 0, 0,  1,-1, 1,-1]);
const EZ  = new Int8Array ([0, 0, 0, 0, 0, 1,-1,  0, 0, 0, 0,  1, 1,-1,-1,  1, 1,-1,-1]);
const WQ  = new Float64Array([
    12/36,
     2/36,  2/36,  2/36,  2/36,  2/36,  2/36,
     1/36,  1/36,  1/36,  1/36,
     1/36,  1/36,  1/36,  1/36,
     1/36,  1/36,  1/36,  1/36,
]);
const OPP = new Uint8Array([0,  2,1,  4,3,  6,5,  10,9,8,7,  14,13,12,11,  18,17,16,15]);
/* eslint-enable no-multi-spaces */

// ── Simulation length ─────────────────────────────────────────────────────────
// ~4 domain flushes (NZ / U_IN = 467 steps per flush) gives a visually
// converged steady-state. Higher Re converges more slowly, so use 3000.
const TOTAL_STEPS  = 3000;
const REPORT_EVERY = 50;    // post progress every N steps

// ── Entry point ───────────────────────────────────────────────────────────────
self.onmessage = ({ data }) => {
    if (data.type === 'start') solve(data.voxels);
};

function solve(vox) {
    // ── 1. Build solid mask ───────────────────────────────────────────────────
    const solid = new Uint8Array(N);
    if (vox) {
        for (let iz = 0; iz < NZ; iz++) {
            for (let iy = 0; iy < NY; iy++) {
                for (let ix = 0; ix < NX; ix++) {
                    const wx = -TW / 2 + (ix + 0.5) * DX;
                    const wy = -TH / 2 + (iy + 0.5) * DX;
                    const wz = -TL / 2 + (iz + 0.5) * DX;
                    const vix = Math.floor((wx - vox.ox) / vox.step);
                    const viy = Math.floor((wy - vox.oy) / vox.step);
                    const viz = Math.floor((wz - vox.oz) / vox.step);
                    if (vix >= 0 && viy >= 0 && viz >= 0 &&
                        vix < vox.nx && viy < vox.ny && viz < vox.nz &&
                        vox.data[vix + vox.nx * (viy + vox.ny * viz)] !== 0) {
                        solid[ix + NX * (iy + NY * iz)] = 1;
                    }
                }
            }
        }
    }

    // ── 2. Precompute neighbor table ──────────────────────────────────────────
    // nbr[idx * NQ + q] = index of the upstream cell in direction q.
    // Value −1 means the upstream neighbour is OOB or solid → bounce-back.
    const nbr = new Int32Array(N * NQ);
    for (let iz = 0; iz < NZ; iz++) {
        for (let iy = 0; iy < NY; iy++) {
            for (let ix = 0; ix < NX; ix++) {
                const idx = ix + NX * (iy + NY * iz);
                for (let q = 0; q < NQ; q++) {
                    const sx = ix - EX[q], sy = iy - EY[q], sz = iz - EZ[q];
                    if (sx >= 0 && sx < NX && sy >= 0 && sy < NY && sz >= 0 && sz < NZ) {
                        const src = sx + NX * (sy + NY * sz);
                        nbr[idx * NQ + q] = solid[src] ? -1 : src;
                    } else {
                        nbr[idx * NQ + q] = -1;  // domain wall → bounce-back
                    }
                }
            }
        }
    }

    // ── 3. Initialise distributions to uniform +Z freestream ─────────────────
    // f[idx * NQ + q] — AoS (array-of-structures) layout: all 19 directions
    // for one cell are contiguous, which suits the per-cell BGK kernel.
    let f    = new Float32Array(N * NQ);
    let fNew = new Float32Array(N * NQ);

    const u2init = U_IN * U_IN;
    for (let idx = 0; idx < N; idx++) {
        const base = idx * NQ;
        for (let q = 0; q < NQ; q++) {
            const udot = EZ[q] * U_IN;   // u = (0, 0, U_IN)
            f[base + q] = WQ[q] * (1.0 + 3.0 * udot + 4.5 * udot * udot - 1.5 * u2init);
        }
    }

    // ── 4. Main LBM loop ──────────────────────────────────────────────────────
    for (let step = 0; step < TOTAL_STEPS; step++) {

        // ── 4a. BGK collision (in-place) ──────────────────────────────────────
        for (let idx = 0; idx < N; idx++) {
            if (solid[idx]) continue;
            const base = idx * NQ;

            // Macroscopic density and velocity
            let rho = 0, ux = 0, uy = 0, uz = 0;
            for (let q = 0; q < NQ; q++) {
                const fq = f[base + q];
                rho += fq;
                ux  += fq * EX[q];
                uy  += fq * EY[q];
                uz  += fq * EZ[q];
            }
            // Clamp density and velocity for stability near high-curvature solid
            // boundaries (τ close to 0.5 amplifies any local density glitch).
            if (rho < 0.5 || rho > 1.8) rho = 1.0;    // reset bad cells to freestream density
            const inv = 1.0 / rho;
            ux *= inv;  uy *= inv;  uz *= inv;
            const u2 = ux * ux + uy * uy + uz * uz;

            // BGK:  f* = f + ω(f_eq − f)
            for (let q = 0; q < NQ; q++) {
                const udot = ux * EX[q] + uy * EY[q] + uz * EZ[q];
                const feq  = WQ[q] * rho * (1.0 + 3.0 * udot + 4.5 * udot * udot - 1.5 * u2);
                f[base + q] += OMEGA * (feq - f[base + q]);
            }
        }

        // ── 4b. Pull-streaming with mid-link bounce-back ───────────────────────
        // fNew[idx][q] ← post-collision f from the upstream cell in direction q.
        // If upstream is solid/OOB the distribution bounces back (reverse direction).
        for (let idx = 0; idx < N; idx++) {
            if (solid[idx]) continue;
            const base = idx * NQ;
            for (let q = 0; q < NQ; q++) {
                const src = nbr[base + q];
                fNew[base + q] = src >= 0 ? f[src * NQ + q] : f[base + OPP[q]];
            }
        }

        // Swap buffers
        const tmp = f;  f = fNew;  fNew = tmp;

        // ── 4c. Boundary conditions ───────────────────────────────────────────
        // Inlet (iz = 0): reset to equilibrium at U_IN every step so the
        // incoming flow is always fresh regardless of the object wake.
        const u2bc = U_IN * U_IN;
        for (let iy = 0; iy < NY; iy++) {
            for (let ix = 0; ix < NX; ix++) {
                const idx = ix + NX * (iy + NY * 0);
                if (solid[idx]) continue;
                const base = idx * NQ;
                for (let q = 0; q < NQ; q++) {
                    const udot = EZ[q] * U_IN;
                    f[base + q] = WQ[q] * (1.0 + 3.0 * udot + 4.5 * udot * udot - 1.5 * u2bc);
                }
            }
        }

        // Outlet (iz = NZ−1): zero-gradient — copy neighbours one layer upstream.
        for (let iy = 0; iy < NY; iy++) {
            for (let ix = 0; ix < NX; ix++) {
                const dst = ix + NX * (iy + NY * (NZ - 1));
                const src = ix + NX * (iy + NY * (NZ - 2));
                if (solid[dst] || solid[src]) continue;
                const bd = dst * NQ, bs = src * NQ;
                for (let q = 0; q < NQ; q++) f[bd + q] = f[bs + q];
            }
        }

        // ── 4d. Progress report ───────────────────────────────────────────────
        if ((step + 1) % REPORT_EVERY === 0) {
            self.postMessage({ type: 'progress', value: (step + 1) / TOTAL_STEPS });
        }
    }

    // ── 5. Extract normalised velocity field ──────────────────────────────────
    // Divide by U_IN so that freestream = (0, 0, 1).
    // physics.js will multiply by VSIM * windMult at query time.
    const vx = new Float32Array(N);
    const vy = new Float32Array(N);
    const vz = new Float32Array(N);

    const invU = 1.0 / U_IN;
    for (let idx = 0; idx < N; idx++) {
        if (solid[idx]) continue;
        const base = idx * NQ;
        let rho = 0, ux = 0, uyv = 0, uzv = 0;
        for (let q = 0; q < NQ; q++) {
            const fq = f[base + q];
            rho += fq;  ux += fq * EX[q];  uyv += fq * EY[q];  uzv += fq * EZ[q];
        }
        if (rho > 1e-6) {
            vx[idx] = (ux  / rho) * invU;
            vy[idx] = (uyv / rho) * invU;
            vz[idx] = (uzv / rho) * invU;
        }
    }

    // Transfer the three velocity arrays (zero-copy) back to the main thread.
    self.postMessage(
        { type: 'complete', NX, NY, NZ, DX, vx: vx.buffer, vy: vy.buffer, vz: vz.buffer },
        [vx.buffer, vy.buffer, vz.buffer],
    );
}
