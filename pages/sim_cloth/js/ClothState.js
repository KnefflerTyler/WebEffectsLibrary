/**
 * ClothState.js — Cloth particle state and topology management
 *
 * Manages ONLY data — no physics step.
 * Physics is handled by GPUCloth (primary) or cpuStep() (fallback).
 *
 * Spring types stored in this.springs:
 *   structural (isBend=false, isDiag=false) — adjacent grid edges
 *   shear      (isBend=false, isDiag=true)  — diagonal grid edges
 *   bend       (isBend=true)               — skip-one grid edges
 */

export class ClothState {
    constructor() {
        this.numParticles = 0;
        // Particle positions (world space)
        this.posX   = new Float32Array(0);
        this.posY   = new Float32Array(0);
        this.posZ   = new Float32Array(0);
        // Previous positions (Verlet)
        this.prevX  = new Float32Array(0);
        this.prevY  = new Float32Array(0);
        this.prevZ  = new Float32Array(0);
        // Pin flags (1 = pinned)
        this.pinned = new Uint8Array(0);

        // Cloth topology
        this.isGrid = true;
        this.cols   = 0;
        this.rows   = 0;
        this._spacing = 0.12;
        this._preset  = 'corners';

        /** @type {{ a:number, b:number, restLen:number, isBend:boolean, isDiag:boolean }[]} */
        this.springs = [];

        // Render data (static after init)
        this.indices = new Uint32Array(0);  // triangle indices
        this.uvs     = new Float32Array(0); // per-vertex UV (2 floats each)

        // Physics config (used by cpuStep fallback)
        this.gravity     = 9.8;
        this.damping     = 0.99;
        this.stiffness   = 1.0;
        this.iterations  = 15;
        this.windX       = 0;
        this.windZ       = 0;
        this.turbulence  = 0.3;
        this.floorY      = -2.0;
        this.floorEnabled = true;
        this.dt          = 1 / 60;
        this.running     = false;
        this.time        = 0;

        // Grab state
        this._grabbed    = -1;
        this._grabPos    = null;
    }

    /* ────────────────────────────────────────────── Grid initialisation ── */

    initGrid(cols, rows, spacing = 0.12, preset = 'corners') {
        this.isGrid   = true;
        this.cols     = cols;
        this.rows     = rows;
        this._spacing = spacing;
        this._preset  = preset;

        const n = cols * rows;
        this.numParticles = n;
        this.posX   = new Float32Array(n);
        this.posY   = new Float32Array(n);
        this.posZ   = new Float32Array(n);
        this.prevX  = new Float32Array(n);
        this.prevY  = new Float32Array(n);
        this.prevZ  = new Float32Array(n);
        this.pinned = new Uint8Array(n);
        this.uvs    = new Float32Array(n * 2);

        const ox = -(cols - 1) * spacing * 0.5;
        const oz = -(rows - 1) * spacing * 0.5;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const i = r * cols + c;
                this.posX[i] = ox + c * spacing;
                this.posY[i] = 1.5;
                this.posZ[i] = oz + r * spacing;
                this.prevX[i] = this.posX[i];
                this.prevY[i] = this.posY[i];
                this.prevZ[i] = this.posZ[i];
                this.uvs[i * 2]     = c / (cols - 1);
                this.uvs[i * 2 + 1] = r / (rows - 1);
            }
        }

        this._buildGridSprings(spacing);
        this._buildGridIndices();
        this._applyPreset(preset);
        this.time = 0;
    }

    reset(preset) {
        this.initGrid(this.cols, this.rows, this._spacing, preset ?? this._preset);
    }

    /* ────────────────────────────────────────────── OBJ initialisation ── */

    /**
     * @param {[number,number,number][]} vertices
     * @param {number[]} faces  Flat 0-based triplet index array
     */
    initFromOBJ(vertices, faces) {
        this.isGrid = false;
        this.cols   = 0;
        this.rows   = 0;

        const n = vertices.length;
        this.numParticles = n;
        this.posX   = new Float32Array(n);
        this.posY   = new Float32Array(n);
        this.posZ   = new Float32Array(n);
        this.prevX  = new Float32Array(n);
        this.prevY  = new Float32Array(n);
        this.prevZ  = new Float32Array(n);
        this.pinned = new Uint8Array(n);
        this.uvs    = new Float32Array(n * 2);

        // Normalise mesh to ≈2-unit span centred at origin, lifted to y≈1.5
        let minX=Infinity, maxX=-Infinity;
        let minY=Infinity, maxY=-Infinity;
        let minZ=Infinity, maxZ=-Infinity;
        for (const [x, y, z] of vertices) {
            if (x<minX) minX=x; if (x>maxX) maxX=x;
            if (y<minY) minY=y; if (y>maxY) maxY=y;
            if (z<minZ) minZ=z; if (z>maxZ) maxZ=z;
        }
        const span  = Math.max(maxX-minX, maxY-minY, maxZ-minZ, 1e-4);
        const scale = 2.0 / span;
        const cx = (minX+maxX)*0.5, cy = (minY+maxY)*0.5, cz = (minZ+maxZ)*0.5;

        for (let i = 0; i < n; i++) {
            const [x, y, z] = vertices[i];
            this.posX[i] = (x - cx) * scale;
            this.posY[i] = (y - cy) * scale + 1.0;
            this.posZ[i] = (z - cz) * scale;
            this.prevX[i] = this.posX[i];
            this.prevY[i] = this.posY[i];
            this.prevZ[i] = this.posZ[i];
            this.uvs[i*2]   = (this.posX[i] + 1.0) * 0.5;
            this.uvs[i*2+1] = (this.posZ[i] + 1.0) * 0.5;
        }

        this._buildMeshSprings(faces);
        this.indices = new Uint32Array(faces);

        // Auto-pin top 8% by Y
        let topY = -Infinity, botY = Infinity;
        for (let i = 0; i < n; i++) {
            if (this.posY[i] > topY) topY = this.posY[i];
            if (this.posY[i] < botY) botY = this.posY[i];
        }
        const thresh = topY - (topY - botY) * 0.08;
        for (let i = 0; i < n; i++) {
            if (this.posY[i] >= thresh) this.pinned[i] = 1;
        }
        this.time = 0;
    }

    /* ─────────────────────────────────────────────── Internal builders ── */

    _buildGridSprings(s) {
        this.springs = [];
        const { cols, rows } = this;
        const sd = s * Math.SQRT2, bs = s * 2;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const i = r * cols + c;
                if (c+1 < cols)  this.springs.push({ a:i, b:i+1,         restLen:s,  isBend:false, isDiag:false });
                if (r+1 < rows)  this.springs.push({ a:i, b:i+cols,       restLen:s,  isBend:false, isDiag:false });
                if (r+1<rows && c+1<cols) {
                    this.springs.push({ a:i,   b:i+cols+1, restLen:sd, isBend:false, isDiag:true  });
                    this.springs.push({ a:i+1, b:i+cols,   restLen:sd, isBend:false, isDiag:true  });
                }
                if (c+2 < cols)  this.springs.push({ a:i, b:i+2,         restLen:bs, isBend:true,  isDiag:false });
                if (r+2 < rows)  this.springs.push({ a:i, b:i+cols*2,    restLen:bs, isBend:true,  isDiag:false });
            }
        }
    }

    _buildMeshSprings(faces) {
        this.springs = [];
        const edgeSet = new Set();
        for (let i = 0; i < faces.length; i += 3) {
            const [a, b, c] = [faces[i], faces[i+1], faces[i+2]];
            [[a,b],[b,c],[c,a]].forEach(([p, q]) => {
                const key = p < q ? `${p},${q}` : `${q},${p}`;
                if (edgeSet.has(key)) return;
                edgeSet.add(key);
                const dx = this.posX[q]-this.posX[p];
                const dy = this.posY[q]-this.posY[p];
                const dz = this.posZ[q]-this.posZ[p];
                const len = Math.sqrt(dx*dx+dy*dy+dz*dz);
                this.springs.push({ a:p, b:q, restLen:len, isBend:false, isDiag:false });
            });
        }
    }

    _buildGridIndices() {
        const idx = [];
        for (let r = 0; r < this.rows-1; r++) {
            for (let c = 0; c < this.cols-1; c++) {
                const tl = r*this.cols+c;
                idx.push(tl, tl+this.cols, tl+1,  tl+1, tl+this.cols, tl+this.cols+1);
            }
        }
        this.indices = new Uint32Array(idx);
    }

    _applyPreset(preset) {
        this.pinned.fill(0);
        this.windX = 0; this.windZ = 0;
        const { cols, rows } = this;
        switch (preset) {
            case 'corners':
                this.pinned[0] = this.pinned[cols-1] = 1;
                break;
            case 'top-edge':
                for (let c = 0; c < cols; c++) this.pinned[c] = 1;
                break;
            case 'flag':
                for (let r = 0; r < rows; r++) this.pinned[r*cols] = 1;
                this.windX = 4.0;
                break;
            case 'tablecloth': {
                const m = Math.floor(cols/2);
                this.pinned[m-1] = this.pinned[m] = this.pinned[m+1] = 1;
                break;
            }
        }
    }

    /* ──────────────────────────────────────────────────── Public API ───── */

    applyPreset(preset) {
        this._preset = preset;
        this._applyPreset(preset);
    }

    clearPins() { this.pinned.fill(0); }

    togglePin(idx) {
        if (idx < 0 || idx >= this.numParticles) return;
        this.pinned[idx] ^= 1;
        if (this.pinned[idx]) {
            this.prevX[idx] = this.posX[idx];
            this.prevY[idx] = this.posY[idx];
            this.prevZ[idx] = this.posZ[idx];
        }
    }

    startGrab(idx, pos) { this._grabbed = idx; this._grabPos = [...pos]; }
    updateGrab(pos)     { if (this._grabPos) Object.assign(this._grabPos, pos); }
    endGrab()           { this._grabbed = -1; this._grabPos = null; }

    /** Ray-cast to nearest cloth particle. */
    pickParticle(origin, dir, threshold = 0.15) {
        const [ox, oy, oz] = origin;
        const [dx, dy, dz] = dir;
        let minD2 = threshold * threshold, minIdx = -1;
        for (let i = 0; i < this.numParticles; i++) {
            const px = this.posX[i]-ox, py = this.posY[i]-oy, pz = this.posZ[i]-oz;
            const t  = px*dx+py*dy+pz*dz;
            if (t < 0) continue;
            const qx=px-t*dx, qy=py-t*dy, qz=pz-t*dz;
            const d2 = qx*qx+qy*qy+qz*qz;
            if (d2 < minD2) { minD2=d2; minIdx=i; }
        }
        return minIdx;
    }

    /* ─────────────────────────────────────────── CPU fallback step ───── */

    cpuStep() {
        if (!this.running) return;
        this.time += this.dt;
        const dt2 = this.dt * this.dt;
        const damp = this.damping;
        const n = this.numParticles;
        const turb = 1 + this.turbulence * (Math.sin(this.time*2.3)*0.5 + Math.sin(this.time*3.7)*0.3);
        const wx = this.windX * turb, wz = this.windZ * turb;

        for (let i = 0; i < n; i++) {
            if (this.pinned[i]) continue;
            const vx = (this.posX[i]-this.prevX[i])*damp;
            const vy = (this.posY[i]-this.prevY[i])*damp;
            const vz = (this.posZ[i]-this.prevZ[i])*damp;
            this.prevX[i]=this.posX[i]; this.prevY[i]=this.posY[i]; this.prevZ[i]=this.posZ[i];
            this.posX[i] += vx + wx*dt2;
            this.posY[i] += vy - this.gravity*dt2;
            this.posZ[i] += vz + wz*dt2;
        }

        const stiff = this.stiffness;
        for (let it = 0; it < this.iterations; it++) {
            for (const { a, b, restLen, isBend } of this.springs) {
                const dx=this.posX[b]-this.posX[a], dy=this.posY[b]-this.posY[a], dz=this.posZ[b]-this.posZ[a];
                const len2 = dx*dx+dy*dy+dz*dz;
                if (len2 < 1e-8) continue;
                const len  = Math.sqrt(len2);
                const s    = isBend ? stiff*0.25 : stiff;
                const corr = (len-restLen)/len*0.5*s;
                const cx=dx*corr, cy=dy*corr, cz=dz*corr;
                if (!this.pinned[a]) { this.posX[a]+=cx; this.posY[a]+=cy; this.posZ[a]+=cz; }
                if (!this.pinned[b]) { this.posX[b]-=cx; this.posY[b]-=cy; this.posZ[b]-=cz; }
            }
            if (this.floorEnabled) {
                for (let i = 0; i < n; i++) if (!this.pinned[i] && this.posY[i] < this.floorY) this.posY[i] = this.floorY;
            }
        }

        if (this._grabbed >= 0 && this._grabPos) {
            const i = this._grabbed;
            this.posX[i]=this._grabPos[0]; this.posY[i]=this._grabPos[1]; this.posZ[i]=this._grabPos[2];
        }
    }
}
