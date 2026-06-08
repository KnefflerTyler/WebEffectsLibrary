/**
 * MeshCollider.js — OBJ mesh collision via pre-baked SDF
 *
 * Pipeline:
 *   1. Receive parsed OBJ (vertices + faces) via constructor
 *   2. Normalise mesh to a ±1 model-space box
 *   3. bake()  — CPU: compute 32³ signed-distance field + gradient
 *   4. upload(gl) — create WebGL RGBA32F 3D texture from baked data
 *
 * The SDF texture layout (RGBA32F):
 *   R,G,B = gradient  (model-space, un-normalised; normalise in shader)
 *   A     = signed distance in model-space units (negative = inside)
 *
 * The constraint shader then resolves cloth particles against the SDF
 * using the collider's world position and uniform scale.
 */

/* ── Math helpers ─────────────────────────────────────────────────────────── */

function dot3(a, b)     { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
function sub3(a, b)     { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function cross3(a, b)   { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function len3(v)        { return Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]); }
function norm3(v)       { const l=len3(v)||1; return [v[0]/l, v[1]/l, v[2]/l]; }
function add3(a, b)     { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function scale3(v, s)   { return [v[0]*s, v[1]*s, v[2]*s]; }
function lerp3(a, b, t) { return [a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1]), a[2]+t*(b[2]-a[2])]; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/* ── Point-to-triangle closest-point + distance ────────────────────────── */
// Ericson "Real-Time Collision Detection" §5.1.5

function closestPtTriangle(p, a, b, c) {
    const ab = sub3(b, a), ac = sub3(c, a), ap = sub3(p, a);
    const d1 = dot3(ab, ap), d2 = dot3(ac, ap);
    if (d1 <= 0 && d2 <= 0) return a;

    const bp = sub3(p, b);
    const d3 = dot3(ab, bp), d4 = dot3(ac, bp);
    if (d3 >= 0 && d4 <= d3) return b;

    const cp = sub3(p, c);
    const d5 = dot3(ab, cp), d6 = dot3(ac, cp);
    if (d6 >= 0 && d5 <= d6) return c;

    const vc = d1*d4 - d3*d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        const v = d1 / (d1 - d3);
        return add3(a, scale3(ab, v));
    }

    const vb = d5*d2 - d1*d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
        const w = d2 / (d2 - d6);
        return add3(a, scale3(ac, w));
    }

    const va = d3*d6 - d5*d4;
    if (va <= 0 && (d4-d3) >= 0 && (d5-d6) >= 0) {
        const w = (d4-d3) / ((d4-d3) + (d5-d6));
        return add3(b, scale3(sub3(c, b), w));
    }

    const denom = 1 / (va + vb + vc);
    const v = vb * denom, w = vc * denom;
    return add3(a, add3(scale3(ab, v), scale3(ac, w)));
}

function distPointTriangle(p, a, b, c) {
    const cp = closestPtTriangle(p, a, b, c);
    return len3(sub3(p, cp));
}

/* ── Ray-triangle intersection (Möller-Trumbore) ──────────────────────── */

function rayTriangleT(orig, dir, a, b, c) {
    const EPS = 1e-8;
    const e1 = sub3(b, a), e2 = sub3(c, a);
    const h   = cross3(dir, e2);
    const det = dot3(e1, h);
    if (Math.abs(det) < EPS) return null;
    const invDet = 1 / det;
    const s = sub3(orig, a);
    const u = dot3(s, h) * invDet;
    if (u < 0 || u > 1) return null;
    const q = cross3(s, e1);
    const v = dot3(dir, q) * invDet;
    if (v < 0 || u + v > 1) return null;
    const t = dot3(e2, q) * invDet;
    return t > EPS ? t : null;
}

/* ── MeshCollider ──────────────────────────────────────────────────────── */

export class MeshCollider {
    /**
     * @param {[number,number,number][]} vertices  Parsed OBJ vertices
     * @param {number[]}                 faces     Flat 0-based triangle index array
     * @param {number}                   gridSize  SDF voxel resolution (default 32)
     */
    constructor(vertices, faces, gridSize = 32) {
        // Normalise to ±1 model space
        let minX=Infinity, maxX=-Infinity;
        let minY=Infinity, maxY=-Infinity;
        let minZ=Infinity, maxZ=-Infinity;
        for (const [x,y,z] of vertices) {
            if(x<minX)minX=x; if(x>maxX)maxX=x;
            if(y<minY)minY=y; if(y>maxY)maxY=y;
            if(z<minZ)minZ=z; if(z>maxZ)maxZ=z;
        }
        const span = Math.max(maxX-minX, maxY-minY, maxZ-minZ, 1e-4);
        const sc   = 2.0 / span;
        const cx=(minX+maxX)*0.5, cy=(minY+maxY)*0.5, cz=(minZ+maxZ)*0.5;

        /** @type {[number,number,number][]} Model-space vertices (range ≈ ±1) */
        this.vertices = vertices.map(([x,y,z]) => [
            (x-cx)*sc, (y-cy)*sc, (z-cz)*sc,
        ]);
        /** @type {number[]} Flat triangle indices */
        this.faces = faces;

        // Precompute model-space AABB (slightly bigger than ±1)
        let mx=-Infinity, mn=Infinity;
        for (const [x,y,z] of this.vertices) {
            const m = Math.max(Math.abs(x),Math.abs(y),Math.abs(z));
            if(m>mx)mx=m; if(m<mn)mn=m;
        }
        const ext = mx * 1.1;
        this.modelMin = [-ext, -ext, -ext];
        this.modelMax = [ ext,  ext,  ext];
        this.modelExtent = [2*ext, 2*ext, 2*ext];

        this.gridSize = gridSize;

        /** @type {Float32Array|null} Baked SDF (RGBA32F, gridSize³) */
        this.sdfData = null;

        /** @type {WebGLTexture|null} */
        this.tex3d   = null;

        // World-space collider transform (set by caller)
        this.pos   = new Float32Array(3);   // world-space centre
        this.scale = 1.0;                    // uniform scale
        this.skin  = 0.025;                  // push-out padding

        // Pre-build triangle list for fast iteration
        this._tris = [];
        for (let i = 0; i < faces.length; i += 3) {
            this._tris.push([
                this.vertices[faces[i]],
                this.vertices[faces[i+1]],
                this.vertices[faces[i+2]],
            ]);
        }
    }

    /* ──────────────────────────────────────────────────── SDF baking ── */

    /** Bake the SDF synchronously. Call once after construction. */
    bake() {
        const G    = this.gridSize;
        const mn   = this.modelMin;
        const ext  = this.modelExtent;
        const step = ext.map(e => e / G);
        const data = new Float32Array(G * G * G * 4);

        const RAY = [1, 0, 0];  // +X ray for inside/outside

        // Pass 1: compute unsigned distance + sign
        const sdfOnly = new Float32Array(G * G * G);

        for (let iz = 0; iz < G; iz++) {
            for (let iy = 0; iy < G; iy++) {
                for (let ix = 0; ix < G; ix++) {
                    const p = [
                        mn[0] + (ix + 0.5) * step[0],
                        mn[1] + (iy + 0.5) * step[1],
                        mn[2] + (iz + 0.5) * step[2],
                    ];

                    let minD = Infinity;
                    for (const [a,b,c] of this._tris) {
                        const d = distPointTriangle(p, a, b, c);
                        if (d < minD) minD = d;
                    }

                    // Inside/outside via +X ray casting
                    let hits = 0;
                    for (const [a,b,c] of this._tris) {
                        if (rayTriangleT(p, RAY, a, b, c) !== null) hits++;
                    }
                    const sign = (hits & 1) ? -1 : 1;

                    sdfOnly[iz * G * G + iy * G + ix] = sign * minD;
                }
            }
        }

        // Pass 2: compute gradient via central finite differences + pack RGBA
        for (let iz = 0; iz < G; iz++) {
            for (let iy = 0; iy < G; iy++) {
                for (let ix = 0; ix < G; ix++) {
                    const idx = iz * G * G + iy * G + ix;

                    const ixn = Math.min(ix+1, G-1), ixp = Math.max(ix-1, 0);
                    const iyn = Math.min(iy+1, G-1), iyp = Math.max(iy-1, 0);
                    const izn = Math.min(iz+1, G-1), izp = Math.max(iz-1, 0);

                    const gx = (sdfOnly[iz*G*G+iy*G+ixn] - sdfOnly[iz*G*G+iy*G+ixp]) * 0.5;
                    const gy = (sdfOnly[iz*G*G+iyn*G+ix] - sdfOnly[iz*G*G+iyp*G+ix]) * 0.5;
                    const gz = (sdfOnly[izn*G*G+iy*G+ix] - sdfOnly[izp*G*G+iy*G+ix]) * 0.5;

                    data[idx*4]   = gx;
                    data[idx*4+1] = gy;
                    data[idx*4+2] = gz;
                    data[idx*4+3] = sdfOnly[idx];
                }
            }
        }

        this.sdfData = data;
        return this;
    }

    /* ─────────────────────────────────────────────── WebGL3D upload ── */

    /**
     * Upload baked SDF data to a WebGL2 3D texture.
     * @param {WebGL2RenderingContext} gl
     */
    upload(gl) {
        if (!this.sdfData) this.bake();

        if (this.tex3d) gl.deleteTexture(this.tex3d);

        const G = this.gridSize;
        this.tex3d = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_3D, this.tex3d);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA32F, G, G, G,
                      0, gl.RGBA, gl.FLOAT, this.sdfData);
        gl.bindTexture(gl.TEXTURE_3D, null);

        return this;
    }

    /* ────────────────────────────────────── GPU descriptor for GPUCloth ── */

    /**
     * Build the collider descriptor object that GPUCloth.setCollider() accepts.
     * Call after upload(gl).
     */
    toGPUDescriptor() {
        const mn  = this.modelMin;
        const ext = this.modelExtent;
        return {
            tex3d:    this.tex3d,
            pos:      Array.from(this.pos),
            scale:    this.scale,
            sdfMin:   mn,
            sdfInvSize: [1/ext[0], 1/ext[1], 1/ext[2]],
            skin:     this.skin,
        };
    }

    /* ──────────────────────────────────── CPU collision (fallback / pick) ── */

    /**
     * Resolve a world-space point against this collider (CPU path).
     * Returns the corrected position, or the original if no penetration.
     * @param {number[]} worldPos [x, y, z]
     * @returns {number[]}
     */
    resolveCPU(worldPos) {
        if (!this.sdfData) return worldPos;

        const G   = this.gridSize;
        const mn  = this.modelMin;
        const ext = this.modelExtent;
        const sc  = this.scale;

        // Transform to model space
        const lx = (worldPos[0] - this.pos[0]) / sc;
        const ly = (worldPos[1] - this.pos[1]) / sc;
        const lz = (worldPos[2] - this.pos[2]) / sc;

        // Sample SDF via trilinear lookup
        const uvx = (lx - mn[0]) / ext[0];
        const uvy = (ly - mn[1]) / ext[1];
        const uvz = (lz - mn[2]) / ext[2];
        if (uvx < 0 || uvy < 0 || uvz < 0 || uvx > 1 || uvy > 1 || uvz > 1)
            return worldPos;

        const fx = uvx * G - 0.5, fy = uvy * G - 0.5, fz = uvz * G - 0.5;
        const ix = clamp(Math.floor(fx), 0, G-1);
        const iy = clamp(Math.floor(fy), 0, G-1);
        const iz = clamp(Math.floor(fz), 0, G-1);

        const sample = (x,y,z) => {
            const xc=clamp(x,0,G-1), yc=clamp(y,0,G-1), zc=clamp(z,0,G-1);
            return this.sdfData[(zc*G*G+yc*G+xc)*4+3];
        };

        // Simple nearest-neighbour for CPU
        const dist = sample(ix, iy, iz) * sc;
        if (dist >= this.skin) return worldPos;

        // Gradient from finite differences in model space
        const eps = ext[0] / G;
        const gx  = (sample(ix+1,iy,iz) - sample(ix-1,iy,iz)) * 0.5;
        const gy  = (sample(ix,iy+1,iz) - sample(ix,iy-1,iz)) * 0.5;
        const gz  = (sample(ix,iy,iz+1) - sample(ix,iy,iz-1)) * 0.5;
        const gl_ = Math.sqrt(gx*gx+gy*gy+gz*gz) || 1;

        // Push in world space
        const push = (this.skin - dist) / gl_;
        return [
            worldPos[0] + gx * push,
            worldPos[1] + gy * push,
            worldPos[2] + gz * push,
        ];
    }
}
