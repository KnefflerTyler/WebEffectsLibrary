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

    // Inside the effective sphere → zero (particle trapped)
    if (r2 < R * R * 0.96) return { x: 0, y: 0, z: 0 };

    const dist  = Math.sqrt(r2);
    const R3    = R * R * R;
    const r3    = dist * dist * dist;
    const r5    = r3 * dist * dist;

    // ── Potential-flow doublet (sphere, uniform flow in +Z) ───────────────────
    // φ = U·(z + R³·z / 2r³)
    //   vz +=  U·( R³/2r³ − 3R³dz²/2r⁵ )
    //   vx -= 3U· R³ dz dx / 2r⁵
    //   vy -= 3U· R³ dz dy / 2r⁵
    const A  = R3 / (2 * r3);
    const B  = 3 * R3 / (2 * r5);
    vz += U * (A - B * dz * dz);
    vx -= U * B * dz * dx;
    vy -= U * B * dz * dy;

    // ── Wake deficit (only downstream of centre, dz > 0) ─────────────────────
    if (dz > 0) {
        const wR     = Math.sqrt(dx*dx + dy*dy);
        const wWidth = R * (1.0 + 0.45 * dz / R);     // wake widens downstream
        if (wR < wWidth) {
            const fDecay  = Math.exp(-dz / (3.8 * R));
            const fRadial = Math.exp(-2.0 * wR * wR / (wWidth * wWidth));
            vz -= U * 0.50 * fDecay * fRadial;

            // ── Von Kármán vortex shedding ────────────────────────────────────
            // Strouhal number St ≈ 0.21 for a sphere in the subcritical regime.
            // Shedding frequency: f = St·U / D,  ω = π·St·U / R
            // Vortices convect downstream at ~0.85·U, giving wavenumber k = ω/(0.85·U)
            //
            // The alternating helical pattern creates the characteristic vortex
            // street visible in smoke-wire and dye-injection wind tunnel experiments.
            const St     = 0.21;
            const omega  = Math.PI * St * U / R;          // angular shedding freq
            const k_z    = omega / (0.85 * U);            // axial wavenumber
            const phase  = omega * t - k_z * dz;          // convecting wave phase

            const shedAmp = U * 0.13 * fDecay * fRadial;
            vy += shedAmp * Math.sin(phase);               // primary alternation
            vx += shedAmp * 0.40 * Math.cos(phase);       // helical component

            // Small residual turbulent fluctuations (broadband spectral content)
            const turb = U * 0.025 * fDecay * fRadial;
            vx += turb * Math.sin(t * 7.1 + dx * 4.3 + dz * 2.9);
            vy += turb * Math.cos(t * 6.3 + dy * 5.1 + dz * 3.3);
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
