// ── Smoke GPGPU simulation shader ─────────────────────────────────────────────
//
// Each fragment = one particle.
// Reads (x, y, z, speed) from uPosTex, advances by one Euler step using the
// exact same potential-flow + wake + vortex-shedding model as physics.js,
// then resets out-of-bounds particles back to their rake injection point.
//
// Output RGBA: (new_x, new_y, new_z, normalised_speed)

precision highp float;

uniform sampler2D uPosTex;   // current particle state: RGB = pos, A = speed
uniform float uDt;           // frame delta-time (seconds)
uniform float uTime;         // total elapsed simulation time
uniform float uU;            // freestream speed = VSIM * windMult
uniform vec3  uObjCenter;
uniform float uObjRadius;    // 0 = no object
uniform float uObjHX;        // AABB half-extents — negative = sphere-only check
uniform float uObjHY;
uniform float uObjHZ;
uniform float uTexW;         // texture width  (float)
uniform float uTexH;         // texture height (float)

// Tunnel + rake constants — must match config.js / smoke.js
const float TW        = 10.0;
const float TH        =  5.0;
const float TL        = 14.0;
const float N_INJ     = 40.0;   // N_INJ_X * N_INJ_Y
const float N_INJ_X   =  8.0;
const float N_INJ_Y   =  5.0;

varying vec2 vUv;

// ── Velocity field (GLSL port of physics.js getVelocity) ──────────────────────
vec3 physicsVelocity(vec3 p) {
    vec3 v = vec3(0.0, 0.0, uU);
    if (uObjRadius < 0.001) return v;

    vec3  d  = p - uObjCenter;
    float r2 = dot(d, d);
    float R  = uObjRadius;

    // Inside-solid check: use AABB when half-extents are provided
    bool inside = (uObjHX > 0.0)
        ? (abs(d.x) <= uObjHX && abs(d.y) <= uObjHY && abs(d.z) <= uObjHZ)
        : (r2 < R * R * 0.96);
    if (inside) return vec3(0.0);

    float dist = sqrt(r2);
    float R3   = R * R * R;
    float r3   = dist * dist * dist;
    float r5   = r3  * dist * dist;

    // Potential-flow doublet (sphere, uniform +Z flow)
    float A = R3 / (2.0 * r3);
    float B = 3.0 * R3 / (2.0 * r5);
    v.z += uU * (A - B * d.z * d.z);
    v.x -= uU * B * d.z * d.x;
    v.y -= uU * B * d.z * d.y;

    // Wake deficit + Von Kármán vortex shedding (downstream of object only)
    if (d.z > 0.0) {
        float wR     = length(d.xy);
        float wWidth = R * (1.0 + 0.45 * d.z / R);
        if (wR < wWidth) {
            float fDecay  = exp(-d.z / (3.8 * R));
            float fRadial = exp(-2.0 * wR * wR / (wWidth * wWidth));
            v.z -= uU * 0.50 * fDecay * fRadial;

            // Strouhal St ≈ 0.21
            float omega   = 3.14159265 * 0.21 * uU / R;
            float kz      = uU > 0.001 ? omega / (0.85 * uU) : 0.0;
            float phase   = omega * uTime - kz * d.z;
            float shedAmp = uU * 0.13 * fDecay * fRadial;
            v.y += shedAmp * sin(phase);
            v.x += shedAmp * 0.40 * cos(phase);

            float turb = uU * 0.025 * fDecay * fRadial;
            v.x += turb * sin(uTime * 7.1 + d.x * 4.3 + d.z * 2.9);
            v.y += turb * cos(uTime * 6.3 + d.y * 5.1 + d.z * 3.3);
        }
    }
    return v;
}

void main() {
    vec4  state = texture2D(uPosTex, vUv);
    vec3  pos   = state.xyz;

    vec3  vel  = physicsVelocity(pos);
    float vmag = length(vel);

    // Euler advection step
    pos += vel * uDt;

    // ── Boundary reset: back to assigned rake injection point ────────────────
    if (pos.z >  TL * 0.5 + 0.3 ||
        abs(pos.x) > TW * 0.5 + 0.3 ||
        abs(pos.y) > TH * 0.5 + 0.3) {

        // Recover particle index from texel coordinates
        vec2  tc  = floor(vUv * vec2(uTexW, uTexH));
        float idx = tc.y * uTexW + tc.x;

        float injIdx    = mod(idx, N_INJ);
        float ix        = mod(injIdx, N_INJ_X);
        float iy        = floor(injIdx / N_INJ_X);
        pos.x = mix(-TW * 0.5 * 0.85, TW * 0.5 * 0.85, ix / (N_INJ_X - 1.0));
        pos.y = mix(-TH * 0.5 * 0.70, TH * 0.5 * 0.70, iy / (N_INJ_Y - 1.0));
        pos.z = -TL * 0.5;
        vmag  = uU;
    }

    float speed = uU > 0.001 ? vmag / uU : 1.0;
    gl_FragColor = vec4(pos, speed);
}
