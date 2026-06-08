/**
 * WebGL2 ray-march volume renderer for the 3D fluid simulation.
 *
 * Architecture
 * ────────────
 * A single fullscreen triangle is drawn each frame. The fragment shader
 * builds a camera ray per pixel, intersects the unit cube [0,1]³ (which
 * maps to the simulation domain), then front-to-back ray-marches through
 * a 3D density texture, accumulating colour.
 *
 * Camera
 * ──────
 * Orbit camera: azimuth + elevation angles around the box centre (0.5,0.5,0.5).
 * Right-drag or scroll adjusts the orbit. The camera always looks at the centre.
 *
 * Coordinate convention
 * ─────────────────────
 * World space:  [0,1]³ with +Y = up, +X = right, +Z = toward viewer.
 * Sim grid:     cell (i,j,k) ↔ world ((i-0.5)/N, (j-0.5)/N, (k-0.5)/N).
 */

// ── GLSL source ─────────────────────────────────────────────────────────────
const VERT = /* glsl */`#version 300 es
void main() {
    // Fullscreen triangle — no VBO needed, only gl_VertexID
    const vec2 pos[3] = vec2[](vec2(-1,-1), vec2(3,-1), vec2(-1,3));
    gl_Position = vec4(pos[gl_VertexID], 0.0, 1.0);
}`;

const FRAG = /* glsl */`#version 300 es
precision highp float;
precision highp sampler3D;

uniform sampler3D uDensity;
uniform vec3      uCamPos;
uniform vec3      uCamFwd;
uniform vec3      uCamRight;
uniform vec3      uCamUp;
uniform float     uFov;        // tan(half_fov)
uniform vec2      uResolution;
uniform int       uTheme;

out vec4 fragColor;

// ── Ray–AABB intersection (unit cube [0,1]³) ────────────────────────────────
vec2 rayBox(vec3 ro, vec3 rd) {
    vec3 inv  = 1.0 / rd;
    vec3 t0   = (vec3(0.0) - ro) * inv;
    vec3 t1   = (vec3(1.0) - ro) * inv;
    vec3 tmin = min(t0, t1);
    vec3 tmax = max(t0, t1);
    return vec2(
        max(max(tmin.x, tmin.y), tmin.z),
        min(min(tmax.x, tmax.y), tmax.z)
    );
}

// ── Colour themes (density → RGB) ───────────────────────────────────────────
vec3 applyTheme(float d) {
    float t = clamp(d * 0.5, 0.0, 1.0);
    if (uTheme == 1) // fire
        return vec3(min(1.0, t*2.0), max(0.0, t*2.0-1.0), max(0.0, t*4.0-3.0));
    if (uTheme == 2) // plasma
        return vec3(0.314+t*0.686, t*0.118, 0.627+t*0.353);
    if (uTheme == 3) // neon
        return vec3(t*0.078, t, t*0.471);
    if (uTheme == 4) // lava
        return vec3(0.706+t*0.294, t*0.314, 0.0);
    // water (default)
    return vec3(t*t*0.118, t*0.471, 0.235+t*0.765);
}

void main() {
    // Build ray direction from pixel position
    vec2 uv = (gl_FragCoord.xy / uResolution) * 2.0 - 1.0;
    uv.x   *= uResolution.x / uResolution.y;
    uv      *= uFov;
    vec3 rd  = normalize(uCamRight * uv.x + uCamUp * uv.y + uCamFwd);
    vec3 ro  = uCamPos;

    vec3 bg = vec3(0.020, 0.035, 0.055); // scene background (outside box only)

    vec2 hit = rayBox(ro, rd);
    if (hit.x >= hit.y || hit.y <= 0.0) {
        fragColor = vec4(bg, 1.0);
        return;
    }

    float tNear = max(hit.x, 0.0);
    float tFar  = hit.y;

    // ── Wireframe edges ──────────────────────────────────────────────────────
    // A surface point is on a box edge when 2+ coordinates are within EDGE_W
    // of 0 or 1. Check both entry (tNear) and exit (tFar) faces.
    const float EDGE_W = 0.018;
    vec3 hp0 = ro + rd * tNear;
    vec3 hp1 = ro + rd * tFar;
    vec3 b0  = step(hp0, vec3(EDGE_W)) + step(vec3(1.0 - EDGE_W), hp0);
    vec3 b1  = step(hp1, vec3(EDGE_W)) + step(vec3(1.0 - EDGE_W), hp1);
    float wire = max(
        step(2.0, b0.x + b0.y + b0.z),
        step(2.0, b1.x + b1.y + b1.z)
    );

    // Front-to-back ray march (96 steps)
    const int STEPS = 96;
    float sStep = (tFar - tNear) / float(STEPS);

    vec4 accum = vec4(0.0);
    for (int s = 0; s < STEPS; s++) {
        if (accum.a >= 0.99) break;
        vec3  p    = ro + rd * (tNear + (float(s) + 0.5) * sStep);
        float dens = texture(uDensity, p).r;
        if (dens > 0.001) {
            float alpha = clamp(dens * sStep * 14.0, 0.0, 0.5);
            vec3  col   = applyTheme(dens);
            accum.rgb  += (1.0 - accum.a) * col * alpha;
            accum.a    += (1.0 - accum.a) * alpha;
        }
    }

    // Interior is black (empty = air). Fluid composited on top, wireframe last.
    vec3 col = mix(vec3(0.0), accum.rgb / max(accum.a, 0.0001), accum.a);
    col = mix(col, vec3(0.22, 0.38, 0.65), wire * (1.0 - accum.a));

    fragColor = vec4(col, 1.0);
}`;

// ── Renderer class ───────────────────────────────────────────────────────────
export class Renderer3D {
    /** @param {HTMLCanvasElement} canvas */
    constructor(canvas) {
        this.canvas = canvas;
        this.gl     = null;

        // Orbit camera state
        this.azimuth   = 35;   // degrees
        this.elevation = 25;   // degrees, clamped to ±85
        this.distance  = 2.2;
        this.fov       = Math.tan(50 * Math.PI / 360); // tan(25°)

        this._N        = 0;
        this._program  = null;
        this._texture  = null;
        this._vao      = null;
        this._interior = null; // reusable Float32Array for texture upload
        this._uniforms = {};   // cached uniform locations
    }

    // ── Initialisation ───────────────────────────────────────────────────

    /** @param {number} N - interior grid dimension */
    init(N) {
        this._N = N;
        this._interior = new Float32Array(N * N * N);

        const gl = this.canvas.getContext('webgl2');
        if (!gl) throw new Error('WebGL2 is not supported in this browser');
        this.gl = gl;

        // Optional extensions for float texture linear filtering
        gl.getExtension('OES_texture_float_linear');
        gl.getExtension('EXT_color_buffer_float');

        // Compile shaders + link program
        this._program = this._compile(VERT, FRAG);

        // Cache uniform locations
        const p = this._program;
        for (const name of ['uDensity','uCamPos','uCamFwd','uCamRight','uCamUp',
                             'uFov','uResolution','uTheme']) {
            this._uniforms[name] = gl.getUniformLocation(p, name);
        }

        // Empty VAO for gl_VertexID-only draw
        this._vao = gl.createVertexArray();

        // Allocate 3D density texture
        this._texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_3D, this._texture);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.R32F, N, N, N, 0, gl.RED, gl.FLOAT, null);
    }

    // ── Shader compilation ───────────────────────────────────────────────

    _compile(vertSrc, fragSrc) {
        const gl = this.gl;
        const mk = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
                throw new Error(gl.getShaderInfoLog(s));
            return s;
        };
        const vs  = mk(gl.VERTEX_SHADER,   vertSrc);
        const fs  = mk(gl.FRAGMENT_SHADER, fragSrc);
        const prog = gl.createProgram();
        gl.attachShader(prog, vs); gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
            throw new Error(gl.getProgramInfoLog(prog));
        gl.deleteShader(vs); gl.deleteShader(fs);
        return prog;
    }

    // ── Camera ───────────────────────────────────────────────────────────

    /** Adjust orbit angles by delta values (degrees). */
    orbit(dAz, dEl) {
        this.azimuth   = (this.azimuth + dAz) % 360;
        this.elevation = Math.max(-85, Math.min(85, this.elevation + dEl));
    }

    /** Adjust zoom (distance). */
    zoom(delta) {
        this.distance = Math.max(1.2, Math.min(5.5, this.distance + delta));
    }

    /** Reset camera to default angles. */
    resetCamera() { this.azimuth = 35; this.elevation = 25; this.distance = 2.2; }

    /**
     * Compute camera position and basis vectors from current orbit state.
     * @returns {{ pos, fwd, right, up }} — all Float32Array[3]
     */
    _cameraVectors() {
        const az  = this.azimuth   * Math.PI / 180;
        const el  = this.elevation * Math.PI / 180;
        const d   = this.distance;
        const ce  = Math.cos(el), se = Math.sin(el);
        const ca  = Math.cos(az), sa = Math.sin(az);

        // Camera position orbiting around box centre (0.5, 0.5, 0.5)
        const px = 0.5 + d * ce * sa;
        const py = 0.5 + d * se;
        const pz = 0.5 + d * ce * ca;

        // Forward = normalize(centre − pos)
        const fl = d;
        const fwd = [
            (0.5 - px) / fl,
            (0.5 - py) / fl,
            (0.5 - pz) / fl,
        ];

        // Right = cross(fwd, worldUp)
        const WU = [0, 1, 0];
        let rx = fwd[1]*WU[2] - fwd[2]*WU[1];
        let ry = fwd[2]*WU[0] - fwd[0]*WU[2];
        let rz = fwd[0]*WU[1] - fwd[1]*WU[0];
        const rl = Math.sqrt(rx*rx + ry*ry + rz*rz) || 1;
        const right = [rx/rl, ry/rl, rz/rl];

        // Up = cross(right, fwd)
        const up = [
            right[1]*fwd[2] - right[2]*fwd[1],
            right[2]*fwd[0] - right[0]*fwd[2],
            right[0]*fwd[1] - right[1]*fwd[0],
        ];

        return { pos: [px, py, pz], fwd, right, up };
    }

    // ── Ray helpers (shared between JS unproject and GLSL) ───────────────

    /** Ray–unit-cube intersection. Returns {tNear, tFar} or null. */
    _rayBox(ro, rd) {
        let near = -Infinity, far = Infinity;
        for (let i = 0; i < 3; i++) {
            const inv = 1 / rd[i];
            const t0 = (0 - ro[i]) * inv;
            const t1 = (1 - ro[i]) * inv;
            near = Math.max(near, Math.min(t0, t1));
            far  = Math.min(far,  Math.max(t0, t1));
        }
        if (near >= far || far <= 0) return null;
        return { tNear: Math.max(near, 0), tFar: far };
    }

    // ── 3D ↔ screen coordinate conversions ──────────────────────────────

    /**
     * Convert screen pixel position to 3D simulation grid coordinates.
     * Returns the midpoint of the ray segment through the volume.
     * @returns {{ gx, gy, gz }} or null if ray misses the box
     */
    unprojectToGrid(screenX, screenY) {
        const N = this._N;
        const W = this.canvas.width, H = this.canvas.height;
        const aspect = W / H;

        const ndcX = (screenX / W * 2 - 1) * aspect * this.fov;
        const ndcY = (1 - screenY / H * 2) * this.fov;

        const { pos, fwd, right, up } = this._cameraVectors();
        const rdx = right[0]*ndcX + up[0]*ndcY + fwd[0];
        const rdy = right[1]*ndcX + up[1]*ndcY + fwd[1];
        const rdz = right[2]*ndcX + up[2]*ndcY + fwd[2];
        const rl  = Math.sqrt(rdx*rdx + rdy*rdy + rdz*rdz);
        const rd  = [rdx/rl, rdy/rl, rdz/rl];

        const hit = this._rayBox(pos, rd);
        if (!hit) return null;

        const tMid = (hit.tNear + hit.tFar) * 0.5;
        const wx = pos[0] + rd[0] * tMid;
        const wy = pos[1] + rd[1] * tMid;
        const wz = pos[2] + rd[2] * tMid;

        return {
            gx: Math.max(1, Math.min(N, (wx * N) | 0 + 1)),
            gy: Math.max(1, Math.min(N, (wy * N) | 0 + 1)),
            gz: Math.max(1, Math.min(N, (wz * N) | 0 + 1)),
        };
    }

    /**
     * Project a 3D grid position to 2D screen coordinates.
     * @returns {{ x, y }} or null if behind the camera
     */
    projectToScreen(gx, gy, gz) {
        const N = this._N;
        const W = this.canvas.width, H = this.canvas.height;
        const aspect = W / H;

        // World position (cell centre)
        const wx = (gx - 0.5) / N;
        const wy = (gy - 0.5) / N;
        const wz = (gz - 0.5) / N;

        const { pos, fwd, right, up } = this._cameraVectors();
        const dx = wx - pos[0], dy = wy - pos[1], dz = wz - pos[2];

        // Camera-space Z (depth along forward axis)
        const camZ = dx*fwd[0] + dy*fwd[1] + dz*fwd[2];
        if (camZ <= 0) return null;

        const camX = dx*right[0] + dy*right[1] + dz*right[2];
        const camY = dx*up[0]    + dy*up[1]    + dz*up[2];

        const ndcX = (camX / (camZ * this.fov)) / aspect;
        const ndcY =  camY / (camZ * this.fov);

        return { x: (ndcX + 1) * 0.5 * W, y: (1 - ndcY) * 0.5 * H };
    }

    /** Unproject screen delta (dvx, dvy) into a world-space 3D velocity vector. */
    screenDeltaToWorldVelocity(dvx, dvy) {
        const { right, up } = this._cameraVectors();
        // Screen +Y is world -up (Y increases downward on screen)
        return {
            vx: right[0] * dvx - up[0] * dvy,
            vy: right[1] * dvx - up[1] * dvy,
            vz: right[2] * dvx - up[2] * dvy,
        };
    }

    // ── Data upload ──────────────────────────────────────────────────────

    /**
     * Extract interior N³ cells from the padded sim buffer and upload to GPU texture.
     * @param {Float32Array} densBuffer - (N+2)³ density array from FluidSim3D
     */
    upload(densBuffer) {
        const gl = this.gl;
        const N  = this._N;
        const S  = N + 2, SS = S * S;
        const out = this._interior;
        let oi = 0;
        for (let k = 1; k <= N; k++)
            for (let j = 1; j <= N; j++)
                for (let i = 1; i <= N; i++)
                    out[oi++] = densBuffer[i + S*j + SS*k];

        gl.bindTexture(gl.TEXTURE_3D, this._texture);
        gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, N, N, N, gl.RED, gl.FLOAT, out);
    }

    // ── Rendering ────────────────────────────────────────────────────────

    /**
     * Resize the canvas to fill the window.
     * Call this on the window resize event.
     */
    resize() {
        this.canvas.width  = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    /**
     * Draw the volume.
     * @param {number} themeIndex - 0..4 colour theme
     */
    render(themeIndex) {
        const gl = this.gl;
        const W  = this.canvas.width, H = this.canvas.height;
        gl.viewport(0, 0, W, H);

        const { pos, fwd, right, up } = this._cameraVectors();
        const u = this._uniforms;

        gl.useProgram(this._program);
        gl.uniform3fv(u.uCamPos,    pos);
        gl.uniform3fv(u.uCamFwd,    fwd);
        gl.uniform3fv(u.uCamRight,  right);
        gl.uniform3fv(u.uCamUp,     up);
        gl.uniform1f(u.uFov,        this.fov);
        gl.uniform2f(u.uResolution, W, H);
        gl.uniform1i(u.uTheme,      themeIndex);
        gl.uniform1i(u.uDensity,    0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_3D, this._texture);

        gl.bindVertexArray(this._vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
    }

    /** Free all WebGL resources. */
    destroy() {
        const gl = this.gl;
        if (!gl) return;
        gl.deleteProgram(this._program);
        gl.deleteTexture(this._texture);
        gl.deleteVertexArray(this._vao);
    }
}
