/**
 * 2-D grid-based Navier-Stokes fluid solver.
 * Based on Jos Stam, "Real-Time Fluid Dynamics for Games" (GDC 2003).
 *
 * The interior grid is N×N.  We allocate (N+2)×(N+2) arrays so that
 * boundary cells at index 0 and N+1 are always available.
 */
export class FluidSim {
    /**
     * @param {number} N - interior grid dimension (e.g. 128)
     * @param {number} [iter=16] - Gauss-Seidel iterations per linear solve
     */
    constructor(N, iter = 16) {
        this.N    = N;
        this.iter = iter;
        const sz  = (N + 2) * (N + 2);

        // velocity fields (x = u, y = v) and their previous-frame buffers
        this.u      = new Float32Array(sz);
        this.v      = new Float32Array(sz);
        this.uPrev  = new Float32Array(sz);
        this.vPrev  = new Float32Array(sz);

        // density / dye field
        this.dens     = new Float32Array(sz);
        this.densPrev = new Float32Array(sz);

        // reusable scratch buffers for the pressure-projection step
        this._p   = new Float32Array(sz);
        this._div = new Float32Array(sz);
    }

    /** Flat index helper: maps grid cell (i, j) → array index. */
    IX(i, j) { return i + (this.N + 2) * j; }

    /** Zero every field. */
    clear() {
        this.u.fill(0);      this.v.fill(0);
        this.uPrev.fill(0);  this.vPrev.fill(0);
        this.dens.fill(0);   this.densPrev.fill(0);
    }

    // ── Private helpers ────────────────────────────────────────────────────

    /** x[i] += dt * s[i]  for all i. */
    _addSrc(x, s, dt) {
        for (let i = 0; i < x.length; i++) x[i] += dt * s[i];
    }

    /**
     * Enforce boundary conditions.
     * b=0 → scalar (no flip)
     * b=1 → x-velocity (flip at left/right walls)
     * b=2 → y-velocity (flip at top/bottom walls)
     */
    _setBnd(b, x) {
        const N = this.N;
        for (let i = 1; i <= N; i++) {
            x[this.IX(0,   i)] = b === 1 ? -x[this.IX(1, i)] : x[this.IX(1, i)];
            x[this.IX(N+1, i)] = b === 1 ? -x[this.IX(N, i)] : x[this.IX(N, i)];
            x[this.IX(i,   0)] = b === 2 ? -x[this.IX(i, 1)] : x[this.IX(i, 1)];
            x[this.IX(i, N+1)] = b === 2 ? -x[this.IX(i, N)] : x[this.IX(i, N)];
        }
        x[this.IX(0,     0  )] = 0.5 * (x[this.IX(1,   0  )] + x[this.IX(0,   1  )]);
        x[this.IX(0,   N+1  )] = 0.5 * (x[this.IX(1, N+1  )] + x[this.IX(0,   N  )]);
        x[this.IX(N+1,   0  )] = 0.5 * (x[this.IX(N,   0  )] + x[this.IX(N+1, 1  )]);
        x[this.IX(N+1, N+1  )] = 0.5 * (x[this.IX(N, N+1  )] + x[this.IX(N+1, N  )]);
    }

    /** Gauss-Seidel relaxation to solve: (I - a·∇²) x = x0 */
    _linSolve(b, x, x0, a, c) {
        const N      = this.N;
        const invC   = 1.0 / c;
        for (let k = 0; k < this.iter; k++) {
            for (let j = 1; j <= N; j++) {
                for (let i = 1; i <= N; i++) {
                    x[this.IX(i, j)] = (
                        x0[this.IX(i, j)] + a * (
                            x[this.IX(i-1, j)] + x[this.IX(i+1, j)] +
                            x[this.IX(i, j-1)] + x[this.IX(i, j+1)]
                        )
                    ) * invC;
                }
            }
            this._setBnd(b, x);
        }
    }

    /** Implicit diffusion step: spreads quantity x by coefficient diff over dt. */
    _diffuse(b, x, x0, diff, dt) {
        const a = dt * diff * this.N * this.N;
        this._linSolve(b, x, x0, a, 1 + 4 * a);
    }

    /** Semi-Lagrangian back-trace advection. */
    _advect(b, d, d0, u, v, dt) {
        const N   = this.N;
        const dt0 = dt * N;

        for (let j = 1; j <= N; j++) {
            for (let i = 1; i <= N; i++) {
                let x = i - dt0 * u[this.IX(i, j)];
                let y = j - dt0 * v[this.IX(i, j)];

                x = Math.max(0.5, Math.min(N + 0.5, x));
                y = Math.max(0.5, Math.min(N + 0.5, y));

                const i0 = x | 0,  i1 = i0 + 1;
                const j0 = y | 0,  j1 = j0 + 1;
                const s1 = x - i0, s0 = 1 - s1;
                const t1 = y - j0, t0 = 1 - t1;

                d[this.IX(i, j)] =
                    s0 * (t0 * d0[this.IX(i0, j0)] + t1 * d0[this.IX(i0, j1)]) +
                    s1 * (t0 * d0[this.IX(i1, j0)] + t1 * d0[this.IX(i1, j1)]);
            }
        }
        this._setBnd(b, d);
    }

    /**
     * Helmholtz-Hodge decomposition: project velocity onto
     * the divergence-free subspace (enforces incompressibility).
     */
    _project(u, v, p, div) {
        const N  = this.N;
        const h  = 1.0 / N;

        for (let j = 1; j <= N; j++) {
            for (let i = 1; i <= N; i++) {
                div[this.IX(i, j)] = -0.5 * h * (
                    u[this.IX(i+1, j)] - u[this.IX(i-1, j)] +
                    v[this.IX(i, j+1)] - v[this.IX(i, j-1)]
                );
                p[this.IX(i, j)] = 0;
            }
        }
        this._setBnd(0, div);
        this._setBnd(0, p);
        this._linSolve(0, p, div, 1, 4);

        const invH = 0.5 / h;
        for (let j = 1; j <= N; j++) {
            for (let i = 1; i <= N; i++) {
                u[this.IX(i, j)] -= invH * (p[this.IX(i+1, j)] - p[this.IX(i-1, j)]);
                v[this.IX(i, j)] -= invH * (p[this.IX(i, j+1)] - p[this.IX(i, j-1)]);
            }
        }
        this._setBnd(1, u);
        this._setBnd(2, v);
    }

    // ── Public step ────────────────────────────────────────────────────────

    /**
     * Advance the simulation by dt seconds.
     * @param {number} visc    - kinematic viscosity (0 = inviscid)
     * @param {number} diff    - density diffusion coefficient
     * @param {number} dt      - time step in seconds
     */
    step(visc, diff, dt) {
        // ── Velocity step ──────────────────────────────────────────────────
        this._addSrc(this.u, this.uPrev, dt);
        this._addSrc(this.v, this.vPrev, dt);

        // Diffuse (swap buffers to reuse them as scratch space)
        let tmp;
        tmp = this.uPrev; this.uPrev = this.u; this.u = tmp;
        this._diffuse(1, this.u, this.uPrev, visc, dt);

        tmp = this.vPrev; this.vPrev = this.v; this.v = tmp;
        this._diffuse(2, this.v, this.vPrev, visc, dt);

        this._project(this.u, this.v, this._p, this._div);

        // Advect
        tmp = this.uPrev; this.uPrev = this.u; this.u = tmp;
        tmp = this.vPrev; this.vPrev = this.v; this.v = tmp;
        this._advect(1, this.u, this.uPrev, this.uPrev, this.vPrev, dt);
        this._advect(2, this.v, this.vPrev, this.uPrev, this.vPrev, dt);

        this._project(this.u, this.v, this._p, this._div);

        // ── Density step ───────────────────────────────────────────────────
        this._addSrc(this.dens, this.densPrev, dt);

        tmp = this.densPrev; this.densPrev = this.dens; this.dens = tmp;
        this._diffuse(0, this.dens, this.densPrev, diff, dt);

        tmp = this.densPrev; this.densPrev = this.dens; this.dens = tmp;
        this._advect(0, this.dens, this.densPrev, this.u, this.v, dt);

        // Clear source buffers ready for the next frame
        this.uPrev.fill(0);
        this.vPrev.fill(0);
        this.densPrev.fill(0);
    }
}
