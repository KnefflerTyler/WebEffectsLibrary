// ── Vector-field GPU vertex shader (3-D, proximity-filtered) ─────────────────
//
// Entirely replaces the per-frame CPU loop in vectorField.js.
// Each arrow = 6 vertices rendered as LINE_SEGMENTS:
//   [0,1] stem base → tip
//   [2,3] left barb root → tip
//   [4,5] right barb root → tip
//
// Static per-vertex attributes:
//   aBase (vec3) — (gx, gy, gz) 3-D grid sample point
//   aRole (float) — sub-vertex role 0-5
//
// Arrows whose base is farther than uProxRadius from the object are parked
// off-screen.  Alpha fades out from 65 % of uProxRadius to the edge.

precision highp float;

attribute vec3  aBase;   // (gx, gy, gz) 3-D grid base; same for 6 verts per arrow
attribute float aRole;   // 0 … 5 — which sub-vertex of the arrow this is

uniform float uTime;
uniform float uU;            // freestream speed = VSIM * windMult
uniform vec3  uObjCenter;
uniform float uObjRadius;    // 0 = no object
uniform float uObjHX;        // AABB half-extents — negative = sphere-only check
uniform float uObjHY;
uniform float uObjHZ;
uniform float uProxRadius;   // world-unit radius: arrows farther away are hidden

varying vec3  vColor;
varying float vAlpha;

// Arrow geometry constants
const float MAX_LEN = 0.55;
const float BARB_T  = 0.28;
const float BARB_W  = 0.18;

// ── Velocity field (GLSL port of physics.js getVelocity) ──────────────────────
vec3 physicsVelocity(vec3 p) {
    vec3 v = vec3(0.0, 0.0, uU);
    if (uObjRadius < 0.001) return v;

    vec3  d  = p - uObjCenter;
    float r2 = dot(d, d);
    float R  = uObjRadius;

    bool inside = (uObjHX > 0.0)
        ? (abs(d.x) <= uObjHX && abs(d.y) <= uObjHY && abs(d.z) <= uObjHZ)
        : (r2 < R * R * 0.96);
    if (inside) return vec3(0.0);

    float dist = sqrt(r2);
    float R3   = R * R * R;
    float r3   = dist * dist * dist;
    float r5   = r3  * dist * dist;

    float A = R3 / (2.0 * r3);
    float B = 3.0 * R3 / (2.0 * r5);
    v.z += uU * (A - B * d.z * d.z);
    v.x -= uU * B * d.z * d.x;
    v.y -= uU * B * d.z * d.y;

    if (d.z > 0.0) {
        float wR     = length(d.xy);
        float wWidth = R * (1.0 + 0.45 * d.z / R);
        if (wR < wWidth) {
            float fDecay  = exp(-d.z / (3.8 * R));
            float fRadial = exp(-2.0 * wR * wR / (wWidth * wWidth));
            v.z -= uU * 0.50 * fDecay * fRadial;

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

// ── Speed → colour ramp (mirrors JS speedColor) ───────────────────────────────
vec3 speedColor(float s) {
    s = clamp(s, 0.0, 2.0);
    if (s < 0.5) return mix(vec3(0.08, 0.18, 0.90), vec3(0.07, 0.85, 0.95), s * 2.0);
    if (s < 1.0) return mix(vec3(0.07, 0.85, 0.95), vec3(0.10, 0.90, 0.25), (s - 0.5) * 2.0);
    if (s < 1.5) return mix(vec3(0.10, 0.90, 0.25), vec3(0.95, 0.85, 0.10), (s - 1.0) * 2.0);
    return             mix(vec3(0.95, 0.85, 0.10), vec3(0.95, 0.10, 0.08), (s - 1.5) * 2.0);
}

void main() {
    // Park arrows outside the proximity sphere off-screen
    float distToObj = length(aBase - uObjCenter);
    if (uObjRadius < 0.001 || distToObj > uProxRadius) {
        vColor      = vec3(0.0);
        vAlpha      = 0.0;
        gl_Position = vec4(0.0, 9999.0, 0.0, 1.0);
        return;
    }

    // Soft alpha fade near the proximity boundary
    vAlpha = 1.0 - smoothstep(uProxRadius * 0.65, uProxRadius, distToObj);

    vec3  vel   = physicsVelocity(aBase);
    float vmag  = length(vel);
    float speed = uU > 0.001 ? vmag / uU : 1.0;
    float len   = MAX_LEN * min(speed / 1.5, 1.0);

    vec3 dir = vmag > 1e-5 ? vel * (len / vmag) : vec3(0.0, 0.0, len * 0.05);
    vec3 tip  = aBase + dir;

    // 3-D barbs: perpendicular to arrow direction via cross product
    vec3 dirNorm = vmag > 1e-5 ? normalize(vel) : vec3(0.0, 0.0, 1.0);
    vec3 upRef   = abs(dot(dirNorm, vec3(0.0, 1.0, 0.0))) < 0.98
                   ? vec3(0.0, 1.0, 0.0)
                   : vec3(1.0, 0.0, 0.0);
    vec3 crossV  = cross(dir, upRef);
    vec3 barbVec = length(crossV) > 1e-5
                   ? normalize(crossV) * (len * BARB_W)
                   : vec3(len * BARB_W, 0.0, 0.0);
    vec3 barbRoot = tip - dir * BARB_T;

    // Select vertex position based on role
    vec3 pos;
    if      (aRole < 0.5) pos = aBase;
    else if (aRole < 1.5) pos = tip;
    else if (aRole < 2.5) pos = barbRoot + barbVec;
    else if (aRole < 3.5) pos = tip;
    else if (aRole < 4.5) pos = barbRoot - barbVec;
    else                  pos = tip;

    vColor      = speedColor(speed);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
