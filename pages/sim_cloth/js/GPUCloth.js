/**
 * GPUCloth.js — WebGL2 GPGPU cloth physics
 *
 * Architecture (all on GPU via FBO ping-pong):
 *   Three position textures  (_tex[0..2], RGBA32F: xyz + pinnedFlag)
 *   Verlet integration pass  (reads cur + prev → writes work)
 *   Constraint solve passes  (Jacobi, N iterations, ping-pong cur ↔ work)
 *
 *   After verlet the triple is rotated:
 *     new work  = old prev  (free for constraint ping-pong)
 *     new prev  = old cur
 *     new cur   = verlet result
 *
 * Colliders (up to 3 simultaneously):
 *   Each collider is a MeshCollider instance.
 *   Its pre-baked RGBA32F 3D SDF texture is sampled in the constraint shader.
 *   Uniform set: uSdfN{On,Tex,Pos,Scale,Min,InvSize,Skin}
 */

/* ── GLSL sources ────────────────────────────────────────────────────────── */

const FULLSCREEN_VERT = /* glsl */`#version 300 es
void main() {
    const vec2 V[3] = vec2[](vec2(-1,-1), vec2(3,-1), vec2(-1,3));
    gl_Position = vec4(V[gl_VertexID], 0.0, 1.0);
}`;

const VERLET_FRAG = /* glsl */`#version 300 es
precision highp float;

uniform highp sampler2D uTexCur;
uniform highp sampler2D uTexPrev;
uniform float uDt;
uniform float uGravity;
uniform float uDamping;
uniform float uWindX;
uniform float uWindZ;
uniform float uWindScale;

out vec4 outPos;

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec4 cur  = texelFetch(uTexCur,  coord, 0);
    vec4 prev = texelFetch(uTexPrev, coord, 0);

    if (cur.a > 0.5) { outPos = cur; return; }   // pinned

    vec3 pos  = cur.xyz;
    vec3 ppos = prev.xyz;

    vec3 vel  = (pos - ppos) * uDamping;
    vec3 acc  = vec3(uWindX * uWindScale, -uGravity, uWindZ * uWindScale);
    vec3 newPos = pos + vel + acc * (uDt * uDt);

    outPos = vec4(newPos, 0.0);
}`;

// The constraint shader source is assembled dynamically to inject MAX_NEIGHBORS
function buildConstraintFrag(maxNeighbors) {
return /* glsl */`#version 300 es
precision highp float;

#define MAX_N ${maxNeighbors}

uniform highp sampler2D uTexPos;
uniform highp sampler2D uTexPrev;   // previous frame positions — used for CCD
uniform highp sampler2D uTexNeighbors;
uniform int   uTexWidth;
uniform int   uNumParticles;
uniform float uStiffness;
uniform bool  uFloorEnabled;
uniform float uFloorY;
uniform bool  uGrabEnabled;
uniform int   uGrabIdx;
uniform vec3  uGrabPos;

uniform int   uColl0Type; uniform vec3 uColl0Pos; uniform float uColl0Scale;
uniform int   uColl1Type; uniform vec3 uColl1Pos; uniform float uColl1Scale;
uniform int   uColl2Type; uniform vec3 uColl2Pos; uniform float uColl2Scale;

const float SKIN = 0.038;

out vec4 outPos;

vec4 readParticle(int k) {
    return texelFetch(uTexPos, ivec2(k % uTexWidth, k / uTexWidth), 0);
}
float ssign(float v) { return v >= 0.0 ? 1.0 : -1.0; }

// ── Swept CCD helpers ────────────────────────────────────────────────────
// Returns first t in [0,1] where segment p0→p1 enters the shape, or 2.0.

float sweptSphere(vec3 p0, vec3 p1, vec3 ctr, float r) {
    vec3  d = p1 - p0, f = p0 - ctr;
    float a = dot(d,d); if (a < 1e-12) return 2.0;
    float b = 2.0*dot(f,d), c = dot(f,f)-r*r;
    float disc = b*b - 4.0*a*c;
    if (disc < 0.0) return 2.0;
    float t = (-b - sqrt(max(0.0,disc))) / (2.0*a);
    return (t >= 0.0 && t <= 1.0) ? t : 2.0;
}

float sweptAABB(vec3 p0, vec3 p1, vec3 cpos, vec3 halfExt) {
    // Only fires when p0 is OUTSIDE the box (avoids false triggers mid-penetration)
    vec3 d = p0 - cpos;
    if (abs(d.x)<halfExt.x && abs(d.y)<halfExt.y && abs(d.z)<halfExt.z) return 2.0;
    vec3 dir = p1 - p0;
    vec3 ro  = p0 - cpos;
    float tEntry = 0.0, tExit = 1.0;
    for (int i = 0; i < 3; i++) {
        float di = (i==0?dir.x:(i==1?dir.y:dir.z));
        float oi = (i==0?ro.x: (i==1?ro.y: ro.z));
        float hi = (i==0?halfExt.x:(i==1?halfExt.y:halfExt.z));
        if (abs(di) < 1e-10) { if (abs(oi) >= hi) return 2.0; }
        else {
            float t1 = (-hi-oi)/di, t2 = (hi-oi)/di;
            if (t1>t2) { float tmp=t1; t1=t2; t2=tmp; }
            tEntry = max(tEntry, t1); tExit = min(tExit, t2);
            if (tEntry > tExit) return 2.0;
        }
    }
    return tEntry >= 0.0 ? tEntry : 2.0;
}

// Approximate pyramid CCD using its bounding box (false positives handled by
// static pushout; false negatives avoided by making bound tight).
float sweptPyramid(vec3 p0, vec3 p1, vec3 cpos, float cscale) {
    float baseY = cpos.y - cscale;
    // Bounding box: x/z = ±cscale, y = baseY..cpos.y+cscale
    vec3 bCentre = vec3(cpos.x, baseY + cscale, cpos.z); // mid-y of bounding box
    vec3 bHalf   = vec3(cscale, cscale, cscale);
    return sweptAABB(p0, p1, bCentre, bHalf);
}

// ── Static pushout (no velocity adjustment) ─────────────────────────────
// Returns the surface normal if penetrating, else vec3(0).
vec3 staticPushout(inout vec3 pos, int ctype, vec3 cpos, float cscale) {
    if (ctype == 1) {
        float r = cscale + SKIN;
        vec3  d = pos - cpos; float dist = length(d);
        if (dist < r) {
            vec3 n = dist > 0.0001 ? d/dist : vec3(0,1,0);
            pos = cpos + n*r;
            return n;
        }
    }
    else if (ctype == 2) {
        float h = cscale + SKIN;
        vec3  d = pos - cpos;
        float ax=abs(d.x), ay=abs(d.y), az=abs(d.z);
        if (ax<h && ay<h && az<h) {
            float px=h-ax, py=h-ay, pz=h-az;
            vec3 n;
            if (px<py&&px<pz) { pos.x=cpos.x+ssign(d.x)*h; n=vec3(ssign(d.x),0,0); }
            else if (py<pz)   { pos.y=cpos.y+ssign(d.y)*h; n=vec3(0,ssign(d.y),0); }
            else               { pos.z=cpos.z+ssign(d.z)*h; n=vec3(0,0,ssign(d.z)); }
            return n;
        }
    }
    else if (ctype == 3) {
        float baseY = cpos.y - cscale;
        float dy    = pos.y - baseY;
        if (dy > 2.0*cscale+SKIN || dy < -SKIN) return vec3(0);
        float dx=pos.x-cpos.x, dz=pos.z-cpos.z;
        float adx=abs(dx), adz=abs(dz);
        float footprint = max(adx, adz);
        float halfAtH   = max(cscale - dy*0.5, 0.0);
        if (footprint > halfAtH+SKIN) return vec3(0);
        float surfaceY = baseY + 2.0*(cscale - footprint);
        if (pos.y >= surfaceY+SKIN) return vec3(0);
        float penX = halfAtH+SKIN - adx;
        float penZ = halfAtH+SKIN - adz;
        float penY = surfaceY+SKIN - pos.y;
        vec3 n;
        if (penX<penZ&&penX<penY) { pos.x=cpos.x+ssign(dx)*(halfAtH+SKIN); n=vec3(ssign(dx),0,0); }
        else if (penZ<penY)       { pos.z=cpos.z+ssign(dz)*(halfAtH+SKIN); n=vec3(0,0,ssign(dz)); }
        else                      { pos.y=surfaceY+SKIN;                    n=vec3(0,1,0); }
        return n;
    }
    return vec3(0);
}

// ── Pre-spring collision: CCD + static pushout + inward-velocity zeroing ─
// prevPos is the last known safe position (from verlet prev texture).
void resolveCCD(inout vec3 pos, vec3 prevPos, int ctype, vec3 cpos, float cscale) {
    if (ctype == 0) return;

    // 1. Check if moving segment prevPos→pos intersects the shape
    float t = 2.0;
    if      (ctype == 1) t = sweptSphere( prevPos, pos, cpos, cscale+SKIN);
    else if (ctype == 2) t = sweptAABB(   prevPos, pos, cpos, vec3(cscale+SKIN));
    else if (ctype == 3) t = sweptPyramid(prevPos, pos, cpos, cscale);

    if (t <= 1.0) {
        // Rewind to just before contact, then let static pushout handle exact position
        pos = prevPos + t * (pos - prevPos);
    }

    // 2. Static pushout + surface normal
    vec3 n = staticPushout(pos, ctype, cpos, cscale);

    // 3. Zero inward-velocity component so Verlet doesn't re-drive into surface.
    //    Only do this when prevPos was outside (avoids flipping already-resting cloth).
    if (dot(n, n) > 0.5) {
        vec3 vel = pos - prevPos;
        float vn = dot(vel, n);
        if (vn < 0.0) pos -= vn * n;   // project velocity onto surface tangent
    }
}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    int   idx   = coord.y * uTexWidth + coord.x;

    if (idx >= uNumParticles) { outPos = vec4(0.0); return; }

    vec4 posData  = texelFetch(uTexPos,  coord, 0);
    if (posData.a > 0.5) { outPos = posData; return; }

    vec4 prevData = texelFetch(uTexPrev, coord, 0);
    vec3 pos      = posData.xyz;
    vec3 prevPos  = prevData.xyz;

    // ── PRE-spring collision: CCD + pushout + vel-zero ────────────────────
    // Hard boundary: springs cannot start from inside the collider.
    resolveCCD(pos, prevPos, uColl0Type, uColl0Pos, uColl0Scale);
    resolveCCD(pos, prevPos, uColl1Type, uColl1Pos, uColl1Scale);
    resolveCCD(pos, prevPos, uColl2Type, uColl2Pos, uColl2Scale);
    if (uFloorEnabled && pos.y < uFloorY) pos.y = uFloorY;

    // ── Jacobi spring constraints ─────────────────────────────────────────
    vec3 correction = vec3(0.0);
    int  nActive    = 0;
    for (int j = 0; j < MAX_N; j++) {
        vec4 nb = texelFetch(uTexNeighbors, ivec2(j, idx), 0);
        int  k  = int(nb.x);
        if (k < 0) break;
        float restLen    = nb.y;
        float stiffScale = nb.z;
        vec4  pkData = readParticle(k);
        vec3  pk     = pkData.xyz;
        float kPin   = pkData.a;
        float wTotal = 1.0 + (kPin > 0.5 ? 0.0 : 1.0);
        vec3  delta  = pk - pos;
        float len    = length(delta);
        if (len < 1e-7) continue;
        float corr = (len - restLen) / len * (1.0 / wTotal) * stiffScale * uStiffness;
        correction += delta * corr;
        nActive++;
    }
    if (nActive > 0) pos += correction / float(nActive);

    // ── POST-spring collision: pure static pushout only ───────────────────
    // No CCD or vel-zeroing here — prevPos is stale after spring corrections.
    staticPushout(pos, uColl0Type, uColl0Pos, uColl0Scale);
    staticPushout(pos, uColl1Type, uColl1Pos, uColl1Scale);
    staticPushout(pos, uColl2Type, uColl2Pos, uColl2Scale);
    if (uFloorEnabled && pos.y < uFloorY) pos.y = uFloorY;

    // ── Grab override ─────────────────────────────────────────────────────
    if (uGrabEnabled && idx == uGrabIdx) pos = uGrabPos;

    outPos = vec4(pos, 0.0);
}`;
}

/* ── GPUCloth class ──────────────────────────────────────────────────────── */

export class GPUCloth {
    /** @param {WebGL2RenderingContext} gl */
    constructor(gl) {
        this.gl = gl;

        // Required for rendering to / reading from RGBA32F textures in WebGL2
        const extCBF = gl.getExtension('EXT_color_buffer_float');
        if (!extCBF) console.warn('GPUCloth: EXT_color_buffer_float not available — GPU sim will not work');

        // Position textures (RGBA32F: xyz + pinnedFlag)
        this._tex  = [null, null, null];
        this._fbo  = [null, null, null];
        this._texW = 0;
        this._texH = 0;
        this._numP = 0;

        // Rotation indices into _tex
        this._cur  = 0;   // current positions (latest)
        this._prev = 1;   // previous positions (one step back)
        this._work = 2;   // scratch / ping-pong buffer

        // Neighbor texture (RGBA32F: neighbourIdx, restLen, stiffScale, 0)
        this._neighborTex   = null;
        this._maxNeighbors  = 24;

        // Shader programs
        this._verletProg     = null;
        this._constraintProg = null;
        this._copyProg       = null;    // simple pos copy for pin upload

        // Null VAO (needed to bind before attribute-less draws)
        this._nullVAO = null;

        // Collider SDF descriptors (up to 3)
        // Each: { tex3d, pos[3], scale, sdfMin[3], sdfInvSize[3], skin }
        this._colliders  = [null, null, null];
        this._dummySdf3D = null;   // lazy-created placeholder for inactive SDF slots

        // Physics config (mirrors ClothState fields)
        this.gravity      = 9.8;
        this.damping      = 0.99;
        this.stiffness    = 1.0;
        this.iterations   = 15;
        this.windX        = 0;
        this.windZ        = 0;
        this.turbulence   = 0.3;
        this.floorY       = -2.0;
        this.floorEnabled = true;
        this.dt           = 1 / 60;
        this.running      = false;
        this.time         = 0;

        // Grab state
        this._grabEnabled = false;
        this._grabIdx     = -1;
        this._grabPos     = new Float32Array(3);

        // Readback buffer (allocated in init)
        this._readbuf = null;
    }

    /* ─────────────────────────────────────────────────── Initialisation ── */

    /**
     * Initialise (or reinitialise) from a ClothState.
     * @param {import('./ClothState.js').ClothState} state
     */
    init(state) {
        const gl = this.gl;
        const n  = state.numParticles;
        if (n === 0) return;

        // Compute texture dimensions
        const w = Math.ceil(Math.sqrt(n));
        const h = Math.ceil(n / w);
        this._texW = w;
        this._texH = h;
        this._numP = n;

        // Compile shaders (once, or recompile if topology requires more neighbors than baked-in MAX_N)
        const valence = new Int32Array(n);
        for (const { a, b } of state.springs) { valence[a]++; valence[b]++; }
        const newMaxN = Math.max(24, ...valence);

        if (!this._verletProg || newMaxN > this._maxNeighbors) {
            this._maxNeighbors = newMaxN;
            if (!this._nullVAO) this._nullVAO = gl.createVertexArray();
            this._verletProg     = this._prog(FULLSCREEN_VERT, VERLET_FRAG);
            this._constraintProg = this._prog(FULLSCREEN_VERT, buildConstraintFrag(this._maxNeighbors));
        }

        // Build / rebuild textures and FBOs
        for (let i = 0; i < 3; i++) {
            if (this._tex[i]) gl.deleteTexture(this._tex[i]);
            if (this._fbo[i]) gl.deleteFramebuffer(this._fbo[i]);
            this._tex[i] = this._makeFloatTex2D(w, h);
            this._fbo[i] = this._makeFBO(this._tex[i]);
        }

        // Readback buffer
        this._readbuf = new Float32Array(w * h * 4);

        // Upload initial positions to _tex[0] and _tex[1] (prev = cur → zero velocity)
        this._uploadPositions(state, 0);
        this._uploadPositions(state, 1);

        this._cur  = 0;
        this._prev = 1;
        this._work = 2;

        // Build neighbor texture from spring data
        this._buildNeighborTex(state);

        this.time = 0;
    }

    /**
     * Reinitialise from a ClothState after reset.
     * If particle count changed (different grid resolution or new OBJ),
     * does a full init including resizing textures.
     * @param {import('./ClothState.js').ClothState} state
     */
    reinit(state) {
        if (state.numParticles !== this._numP) {
            // Particle count changed — full reinit (resizes textures, FBOs, etc.)
            this.init(state);
            return;
        }
        // Same size — just re-upload positions and rebuild springs
        this._uploadPositions(state, this._cur);
        this._uploadPositions(state, this._prev);
        this._buildNeighborTex(state);
        this.time = 0;
    }

    /* ──────────────────────────────────────────────────── Physics step ── */

    step() {
        if (!this.running) return;
        this.time += this.dt;

        const windScale = 1 + this.turbulence * (
            Math.sin(this.time * 2.3) * 0.5 + Math.sin(this.time * 3.7) * 0.3
        );

        // 1. Verlet integration
        this._verletPass(windScale);

        // 2. Constraint + collider iterations (CCD pre-spring, static pushout post-spring)
        for (let i = 0; i < this.iterations; i++) {
            this._constraintPass();
        }

        // Restore default framebuffer and GL state for renderer
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    _verletPass(windScale) {
        const gl = this.gl;
        gl.disable(gl.BLEND);   // no blending on float FBOs
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo[this._work]);
        gl.viewport(0, 0, this._texW, this._texH);
        gl.useProgram(this._verletProg);

        this._bindTex(this._verletProg, 'uTexCur',  0, this._tex[this._cur]);
        this._bindTex(this._verletProg, 'uTexPrev', 1, this._tex[this._prev]);
        gl.uniform1f(this._ul(this._verletProg, 'uDt'),         this.dt);
        gl.uniform1f(this._ul(this._verletProg, 'uGravity'),    this.gravity);
        gl.uniform1f(this._ul(this._verletProg, 'uDamping'),    this.damping);
        gl.uniform1f(this._ul(this._verletProg, 'uWindX'),      this.windX);
        gl.uniform1f(this._ul(this._verletProg, 'uWindZ'),      this.windZ);
        gl.uniform1f(this._ul(this._verletProg, 'uWindScale'),  windScale);

        gl.bindVertexArray(this._nullVAO);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);

        // Rotate: prev←cur, cur←work, work←old-prev
        const oldPrev  = this._prev;
        this._prev = this._cur;
        this._cur  = this._work;
        this._work = oldPrev;
    }

    _constraintPass() {
        const gl   = this.gl;
        const prog = this._constraintProg;

        gl.disable(gl.BLEND);   // no blending on float FBOs
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo[this._work]);
        gl.viewport(0, 0, this._texW, this._texH);
        gl.useProgram(prog);

        this._bindTex(prog, 'uTexPos',       0, this._tex[this._cur]);
        this._bindTex(prog, 'uTexPrev',      2, this._tex[this._prev]);  // for CCD
        this._bindTex(prog, 'uTexNeighbors', 1, this._neighborTex);
        gl.uniform1i(this._ul(prog, 'uTexWidth'),     this._texW);
        gl.uniform1i(this._ul(prog, 'uNumParticles'), this._numP);
        gl.uniform1f(this._ul(prog, 'uStiffness'),    this.stiffness);
        gl.uniform1i(this._ul(prog, 'uFloorEnabled'), this.floorEnabled ? 1 : 0);
        gl.uniform1f(this._ul(prog, 'uFloorY'),       this.floorY);
        gl.uniform1i(this._ul(prog, 'uGrabEnabled'),  this._grabEnabled ? 1 : 0);
        gl.uniform1i(this._ul(prog, 'uGrabIdx'),      this._grabIdx);
        gl.uniform3fv(this._ul(prog, 'uGrabPos'),     this._grabPos);

        // Analytical colliders
        for (let ci = 0; ci < 3; ci++) {
            const c = this._colliders[ci];
            gl.uniform1i(this._ul(prog, `uColl${ci}Type`),  c ? c.type  : 0);
            gl.uniform3fv(this._ul(prog, `uColl${ci}Pos`),  c ? c.pos   : [0,0,0]);
            gl.uniform1f(this._ul(prog,  `uColl${ci}Scale`),c ? c.scale : 1.0);
        }

        gl.bindVertexArray(this._nullVAO);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);

        // Swap cur ↔ work
        const tmp  = this._cur;
        this._cur  = this._work;
        this._work = tmp;
    }

    /* ────────────────────────────────────────────────────── Public API ── */

    setGrab(idx, x, y, z) {
        this._grabEnabled = true;
        this._grabIdx     = idx;
        this._grabPos[0]  = x;
        this._grabPos[1]  = y;
        this._grabPos[2]  = z;
    }

    clearGrab() {
        this._grabEnabled = false;
        this._grabIdx     = -1;
    }

    /**
     * Set pin state for a single particle by patching the GPU texture.
     * @param {number} idx Particle index
     * @param {boolean} pinned
     * @param {number} x World x (current position, for re-upload)
     * @param {number} y
     * @param {number} z
     */
    setParticlePin(idx, pinned, x, y, z) {
        const gl = this.gl;
        const px = idx % this._texW;
        const py = Math.floor(idx / this._texW);
        const data = new Float32Array([x, y, z, pinned ? 1.0 : 0.0]);
        for (let t = 0; t < 3; t++) {
            gl.bindTexture(gl.TEXTURE_2D, this._tex[t]);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, px, py, 1, 1,
                gl.RGBA, gl.FLOAT, data);
        }
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    /**
     * Set a collider (0-2). Pass null to remove.
     * @param {number} slot  0, 1, or 2
     * @param {{type:number, pos:number[], scale:number}|null} desc
     *   type: 1=sphere, 2=box, 3=pyramid
     */
    setCollider(slot, desc) {
        this._colliders[slot] = desc;
    }

    /** Get current position texture for use in the cloth vertex shader. */
    getPosTex() { return this._tex[this._cur]; }

    /** Texture width (particles per row). */
    get texWidth()  { return this._texW; }
    /** Number of particles. */
    get numParticles() { return this._numP; }

    /**
     * Synchronous GPU→CPU readback. Updates state.posX/Y/Z/pinned.
     * Stalls the pipeline — call sparingly (picking, reset).
     * @param {import('./ClothState.js').ClothState} state
     */
    readback(state) {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo[this._cur]);
        gl.readPixels(0, 0, this._texW, this._texH, gl.RGBA, gl.FLOAT, this._readbuf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        const n = this._numP;
        for (let i = 0; i < n; i++) {
            state.posX[i]   = this._readbuf[i * 4];
            state.posY[i]   = this._readbuf[i * 4 + 1];
            state.posZ[i]   = this._readbuf[i * 4 + 2];
            state.pinned[i] = this._readbuf[i * 4 + 3] > 0.5 ? 1 : 0;
        }
    }

    /* ───────────────────────────────────────────── Internal helpers ───── */

    _uploadPositions(state, texIdx) {
        const gl   = this.gl;
        const n    = state.numParticles;
        const data = new Float32Array(this._texW * this._texH * 4);

        for (let i = 0; i < n; i++) {
            data[i * 4]     = state.posX[i];
            data[i * 4 + 1] = state.posY[i];
            data[i * 4 + 2] = state.posZ[i];
            data[i * 4 + 3] = state.pinned[i] ? 1.0 : 0.0;
        }

        gl.bindTexture(gl.TEXTURE_2D, this._tex[texIdx]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this._texW, this._texH,
                      0, gl.RGBA, gl.FLOAT, data);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    _buildNeighborTex(state) {
        const gl = this.gl;
        const n  = this._numP;
        const MN = this._maxNeighbors;

        // Build per-particle adjacency lists
        const lists = Array.from({ length: n }, () => []);
        for (const { a, b, restLen, isBend } of state.springs) {
            const stiff = isBend ? 0.25 : 1.0;
            lists[a].push({ k: b, restLen, stiff });
            lists[b].push({ k: a, restLen, stiff });
        }

        // Pack into (MN × n) RGBA32F texture
        const data = new Float32Array(MN * n * 4).fill(-1);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < Math.min(lists[i].length, MN); j++) {
                const { k, restLen, stiff } = lists[i][j];
                const base = (i * MN + j) * 4;
                data[base]     = k;
                data[base + 1] = restLen;
                data[base + 2] = stiff;
            }
        }

        if (this._neighborTex) gl.deleteTexture(this._neighborTex);
        this._neighborTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this._neighborTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, MN, n, 0, gl.RGBA, gl.FLOAT, data);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    _makeFloatTex2D(w, h) {
        const gl  = this.gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return tex;
    }

    /** Return (creating once) a 1×1×1 RGBA32F 3D texture used as a no-op placeholder
     *  for inactive SDF sampler slots. Binding null to a sampler3D unit while another
     *  unit holds a sampler2D triggers "Two textures of different types use same sampler". */
    _getDummySdf3D() {
        if (this._dummySdf3D) return this._dummySdf3D;
        const gl  = this.gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_3D, tex);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA32F, 1, 1, 1, 0, gl.RGBA, gl.FLOAT,
                      new Float32Array([0, 0, 0, 1e6])); // dist=1e6 → never pushes
        gl.bindTexture(gl.TEXTURE_3D, null);
        this._dummySdf3D = tex;
        return tex;
    }

    _makeFBO(tex) {
        const gl  = this.gl;
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return fbo;
    }

    _prog(vsrc, fsrc) {
        const gl = this.gl;
        const compile = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
                throw new Error(`GPUCloth shader error:\n${gl.getShaderInfoLog(s)}`);
            return s;
        };
        const p = gl.createProgram();
        gl.attachShader(p, compile(gl.VERTEX_SHADER,   vsrc));
        gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsrc));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS))
            throw new Error(`GPUCloth program link error:\n${gl.getProgramInfoLog(p)}`);
        return p;
    }

    _ul(prog, name) {
        return this.gl.getUniformLocation(prog, name);
    }

    _bindTex(prog, name, unit, tex, is3d = false) {
        const gl  = this.gl;
        const loc = gl.getUniformLocation(prog, name);
        if (loc === null) return;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(is3d ? gl.TEXTURE_3D : gl.TEXTURE_2D, tex);
        gl.uniform1i(loc, unit);
    }
}
