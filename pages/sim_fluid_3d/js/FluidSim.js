/**
 * 3D Navier-Stokes fluid solver (CPU, Stam 2003 extended to 3D).
 * Interior grid is N×N×N. Buffer stride is S = N+2 on each axis.
 * Flat index: IX(i,j,k) = i + S*j + S²*k
 */
export class FluidSim3D {
    /** @param {number} N interior dimension  @param {number} iter Gauss-Seidel iters */
    constructor(N, iter = 8) {
        this.N    = N;
        this.iter = iter;
        const S   = N + 2;
        this.S    = S;
        this.SS   = S * S;
        const sz  = S * S * S;

        this.u     = new Float32Array(sz);
        this.v     = new Float32Array(sz);
        this.w     = new Float32Array(sz);
        this.uPrev = new Float32Array(sz);
        this.vPrev = new Float32Array(sz);
        this.wPrev = new Float32Array(sz);

        this.dens     = new Float32Array(sz);
        this.densPrev = new Float32Array(sz);

        this._p   = new Float32Array(sz);
        this._div = new Float32Array(sz);
    }

    IX(i, j, k) { return i + this.S * j + this.SS * k; }

    clear() {
        this.u.fill(0);     this.v.fill(0);     this.w.fill(0);
        this.uPrev.fill(0); this.vPrev.fill(0); this.wPrev.fill(0);
        this.dens.fill(0);  this.densPrev.fill(0);
    }

    _addSrc(x, s, dt) { for (let i = 0; i < x.length; i++) x[i] += dt * s[i]; }

    /**
     * Boundary conditions.
     * b=0 scalar, b=1 flip x-faces, b=2 flip y-faces, b=3 flip z-faces.
     */
    _setBnd(b, x) {
        const N = this.N, S = this.S, SS = this.SS;

        // Z faces (k = 0, k = N+1)
        for (let j = 1; j <= N; j++) {
            for (let i = 1; i <= N; i++) {
                x[i + S*j]            = b===3 ? -x[i+S*j+SS]     : x[i+S*j+SS];
                x[i + S*j + SS*(N+1)] = b===3 ? -x[i+S*j+SS*N]   : x[i+S*j+SS*N];
            }
        }
        // Y faces (j = 0, j = N+1)
        for (let k = 1; k <= N; k++) {
            for (let i = 1; i <= N; i++) {
                x[i + SS*k]            = b===2 ? -x[i+S+SS*k]     : x[i+S+SS*k];
                x[i + S*(N+1) + SS*k]  = b===2 ? -x[i+S*N+SS*k]   : x[i+S*N+SS*k];
            }
        }
        // X faces (i = 0, i = N+1)
        for (let k = 1; k <= N; k++) {
            for (let j = 1; j <= N; j++) {
                x[S*j + SS*k]          = b===1 ? -x[1+S*j+SS*k]   : x[1+S*j+SS*k];
                x[N+1 + S*j + SS*k]    = b===1 ? -x[N+S*j+SS*k]   : x[N+S*j+SS*k];
            }
        }
        // Edges along X (j,k both at boundary)
        for (let i = 1; i <= N; i++) {
            x[i+S*0   +SS*0    ] = 0.5*(x[i+S*1+SS*0    ] + x[i+S*0+SS*1    ]);
            x[i+S*0   +SS*(N+1)] = 0.5*(x[i+S*1+SS*(N+1)] + x[i+S*0+SS*N    ]);
            x[i+S*(N+1)+SS*0   ] = 0.5*(x[i+S*N+SS*0    ] + x[i+S*(N+1)+SS*1]);
            x[i+S*(N+1)+SS*(N+1)]= 0.5*(x[i+S*N+SS*(N+1)] + x[i+S*(N+1)+SS*N]);
        }
        // Edges along Y (i,k both at boundary)
        for (let j = 1; j <= N; j++) {
            x[0   +S*j+SS*0    ] = 0.5*(x[1  +S*j+SS*0    ] + x[0+S*j+SS*1    ]);
            x[0   +S*j+SS*(N+1)] = 0.5*(x[1  +S*j+SS*(N+1)] + x[0+S*j+SS*N    ]);
            x[N+1 +S*j+SS*0    ] = 0.5*(x[N  +S*j+SS*0    ] + x[N+1+S*j+SS*1  ]);
            x[N+1 +S*j+SS*(N+1)]= 0.5*(x[N  +S*j+SS*(N+1)] + x[N+1+S*j+SS*N  ]);
        }
        // Edges along Z (i,j both at boundary)
        for (let k = 1; k <= N; k++) {
            x[0   +S*0   +SS*k] = 0.5*(x[1  +S*0   +SS*k] + x[0+S*1  +SS*k]);
            x[0   +S*(N+1)+SS*k]= 0.5*(x[1  +S*(N+1)+SS*k] + x[0+S*N +SS*k]);
            x[N+1 +S*0   +SS*k] = 0.5*(x[N  +S*0   +SS*k] + x[N+1+S*1+SS*k]);
            x[N+1 +S*(N+1)+SS*k]= 0.5*(x[N  +S*(N+1)+SS*k] + x[N+1+S*N+SS*k]);
        }
        // 8 corners (average of 3 adjacent face cells)
        x[0   +S*0   +SS*0    ]=(x[1+S*0   +SS*0    ]+x[0+S*1   +SS*0    ]+x[0+S*0   +SS*1    ])/3;
        x[N+1 +S*0   +SS*0    ]=(x[N+S*0   +SS*0    ]+x[N+1+S*1 +SS*0    ]+x[N+1+S*0 +SS*1    ])/3;
        x[0   +S*(N+1)+SS*0   ]=(x[1+S*(N+1)+SS*0   ]+x[0+S*N   +SS*0    ]+x[0+S*(N+1)+SS*1   ])/3;
        x[N+1 +S*(N+1)+SS*0   ]=(x[N+S*(N+1)+SS*0   ]+x[N+1+S*N +SS*0    ]+x[N+1+S*(N+1)+SS*1 ])/3;
        x[0   +S*0   +SS*(N+1)]=(x[1+S*0   +SS*(N+1)]+x[0+S*1   +SS*(N+1)]+x[0+S*0   +SS*N    ])/3;
        x[N+1 +S*0   +SS*(N+1)]=(x[N+S*0   +SS*(N+1)]+x[N+1+S*1 +SS*(N+1)]+x[N+1+S*0 +SS*N   ])/3;
        x[0   +S*(N+1)+SS*(N+1)]=(x[1+S*(N+1)+SS*(N+1)]+x[0+S*N +SS*(N+1)]+x[0+S*(N+1)+SS*N  ])/3;
        x[N+1 +S*(N+1)+SS*(N+1)]=(x[N+S*(N+1)+SS*(N+1)]+x[N+1+S*N+SS*(N+1)]+x[N+1+S*(N+1)+SS*N])/3;
    }

    /** Red-Black-free Gauss-Seidel with optimised inner loop (stride-based index). */
    _linSolve(b, x, x0, a, c) {
        const N = this.N, S = this.S, SS = this.SS;
        const invC = 1.0 / c;
        for (let it = 0; it < this.iter; it++) {
            for (let k = 1; k <= N; k++) {
                const kBase = k * SS;
                for (let j = 1; j <= N; j++) {
                    let idx = 1 + j * S + kBase;
                    for (let i = 1; i <= N; i++, idx++) {
                        x[idx] = (x0[idx] + a * (
                            x[idx-1] + x[idx+1] +
                            x[idx-S] + x[idx+S] +
                            x[idx-SS]+ x[idx+SS]
                        )) * invC;
                    }
                }
            }
            this._setBnd(b, x);
        }
    }

    _diffuse(b, x, x0, diff, dt) {
        const a = dt * diff * this.N * this.N;
        this._linSolve(b, x, x0, a, 1 + 6 * a);
    }

    /** Semi-Lagrangian 3-D back-trace with trilinear interpolation. */
    _advect(b, d, d0, u, v, w, dt) {
        const N = this.N, S = this.S, SS = this.SS, dt0 = dt * N;
        const Nf = N;
        for (let k = 1; k <= N; k++) {
            const kBase = k * SS;
            for (let j = 1; j <= N; j++) {
                let idx = 1 + j * S + kBase;
                for (let i = 1; i <= N; i++, idx++) {
                    let px = i - dt0 * u[idx];
                    let py = j - dt0 * v[idx];
                    let pz = k - dt0 * w[idx];
                    px = Math.max(0.5, Math.min(Nf + 0.5, px));
                    py = Math.max(0.5, Math.min(Nf + 0.5, py));
                    pz = Math.max(0.5, Math.min(Nf + 0.5, pz));
                    const i0=px|0, i1=i0+1;
                    const j0=py|0, j1=j0+1;
                    const k0=pz|0, k1=k0+1;
                    const sx1=px-i0, sx0=1-sx1;
                    const sy1=py-j0, sy0=1-sy1;
                    const sz1=pz-k0, sz0=1-sz1;
                    d[idx] =
                        sx0*(sy0*(sz0*d0[i0+S*j0+SS*k0] + sz1*d0[i0+S*j0+SS*k1]) +
                             sy1*(sz0*d0[i0+S*j1+SS*k0] + sz1*d0[i0+S*j1+SS*k1])) +
                        sx1*(sy0*(sz0*d0[i1+S*j0+SS*k0] + sz1*d0[i1+S*j0+SS*k1]) +
                             sy1*(sz0*d0[i1+S*j1+SS*k0] + sz1*d0[i1+S*j1+SS*k1]));
                }
            }
        }
        this._setBnd(b, d);
    }

    /** 3-D Helmholtz-Hodge pressure projection (enforces incompressibility). */
    _project(u, v, w, p, div) {
        const N = this.N, S = this.S, SS = this.SS;
        const h = 1.0 / N;
        for (let k = 1; k <= N; k++) {
            const kBase = k * SS;
            for (let j = 1; j <= N; j++) {
                let idx = 1 + j * S + kBase;
                for (let i = 1; i <= N; i++, idx++) {
                    div[idx] = -(h * 0.5) * (
                        u[idx+1]  - u[idx-1]  +
                        v[idx+S]  - v[idx-S]  +
                        w[idx+SS] - w[idx-SS]
                    );
                    p[idx] = 0;
                }
            }
        }
        this._setBnd(0, div);
        this._setBnd(0, p);
        this._linSolve(0, p, div, 1, 6);

        const invH = 0.5 / h;
        for (let k = 1; k <= N; k++) {
            const kBase = k * SS;
            for (let j = 1; j <= N; j++) {
                let idx = 1 + j * S + kBase;
                for (let i = 1; i <= N; i++, idx++) {
                    u[idx] -= invH * (p[idx+1]  - p[idx-1] );
                    v[idx] -= invH * (p[idx+S]  - p[idx-S] );
                    w[idx] -= invH * (p[idx+SS] - p[idx-SS]);
                }
            }
        }
        this._setBnd(1, u); this._setBnd(2, v); this._setBnd(3, w);
    }

    /** Advance by dt seconds. */
    step(visc, diff, dt) {
        this._addSrc(this.u, this.uPrev, dt);
        this._addSrc(this.v, this.vPrev, dt);
        this._addSrc(this.w, this.wPrev, dt);

        let tmp;
        tmp=this.uPrev; this.uPrev=this.u; this.u=tmp;
        this._diffuse(1, this.u, this.uPrev, visc, dt);
        tmp=this.vPrev; this.vPrev=this.v; this.v=tmp;
        this._diffuse(2, this.v, this.vPrev, visc, dt);
        tmp=this.wPrev; this.wPrev=this.w; this.w=tmp;
        this._diffuse(3, this.w, this.wPrev, visc, dt);

        this._project(this.u, this.v, this.w, this._p, this._div);

        tmp=this.uPrev; this.uPrev=this.u; this.u=tmp;
        tmp=this.vPrev; this.vPrev=this.v; this.v=tmp;
        tmp=this.wPrev; this.wPrev=this.w; this.w=tmp;
        this._advect(1, this.u, this.uPrev, this.uPrev, this.vPrev, this.wPrev, dt);
        this._advect(2, this.v, this.vPrev, this.uPrev, this.vPrev, this.wPrev, dt);
        this._advect(3, this.w, this.wPrev, this.uPrev, this.vPrev, this.wPrev, dt);

        this._project(this.u, this.v, this.w, this._p, this._div);

        this._addSrc(this.dens, this.densPrev, dt);
        tmp=this.densPrev; this.densPrev=this.dens; this.dens=tmp;
        this._diffuse(0, this.dens, this.densPrev, diff, dt);
        tmp=this.densPrev; this.densPrev=this.dens; this.dens=tmp;
        this._advect(0, this.dens, this.densPrev, this.u, this.v, this.w, dt);

        this.uPrev.fill(0); this.vPrev.fill(0); this.wPrev.fill(0);
        this.densPrev.fill(0);
    }
}
