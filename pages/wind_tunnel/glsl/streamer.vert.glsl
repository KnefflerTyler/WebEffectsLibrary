// ── Streamer vertex shader ────────────────────────────────────────────────────
// Each streamer is a THREE.Line whose vertices are a pre-integrated streamline
// running continuously from the tunnel inlet to outlet.
//
// Attributes injected by Three.js: position (vec3)
// Custom attribute updated per frame: aSpeed (float, v / U_free)
//
// Proximity fade:
//   When an object is present (uObjRadius > 0) vertices far from the object
//   are faded to invisible — only the aerodynamically interesting region is
//   rendered.  When no object is loaded (uObjRadius == 0) streamers display
//   at uniform opacity across the whole tunnel.

attribute float aSpeed;   // normalised velocity magnitude (0=stagnation … 1=freestream … 2=equator)

// Proximity-fade uniforms (updated each frame when an object is present)
uniform vec3  uObjCenter;  // world-space object bounding-sphere centre
uniform float uObjRadius;  // bounding-sphere radius  (0 → no object)
uniform float uFadeMult;   // visible up to uObjRadius * uFadeMult from centre

varying vec3  vColor;
varying float vAlpha;

// ── Velocity → colour ramp ────────────────────────────────────────────────────
// Mirrors JS speedRamp():  0 → blue, 0.5 → cyan, 1 → green, 1.5 → yellow, 2 → red
vec3 speedRamp(float s) {
    float t = clamp(s / 2.0, 0.0, 1.0);
    if (t < 0.25) return mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), t / 0.25);
    if (t < 0.50) return mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 1.0, 0.0), (t - 0.25) / 0.25);
    if (t < 0.75) return mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 1.0, 0.0), (t - 0.50) / 0.25);
    return           mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), (t - 0.75) / 0.25);
}

void main() {
    vColor = speedRamp(aSpeed);

    if (uObjRadius < 0.01) {
        // ── No object present: show the whole streamline at low opacity ───────
        vAlpha = 0.55;
    } else {
        // ── Proximity fade: bright near surface, invisible far away ───────────
        float dist    = length(position - uObjCenter);
        float inner   = uObjRadius * 1.1;                        // full-bright shell
        float outer   = max(uObjRadius * uFadeMult, inner + 0.001);
        vAlpha = 1.0 - smoothstep(inner, outer, dist);
    }

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
