// Moon — cel shading + per-face crater pits.
// Uses vUv (0..1 per face) to punch dark circles at fixed positions,
// giving a recognisably cratered, grey surface distinct from planets.

uniform float uShininess;
uniform vec3  uCorePos;
uniform vec3  uCoreColor;
uniform float uCoreIntens;
uniform vec3  uRimDir;
uniform vec3  uRimColor;
uniform vec3  uAmbient;

varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vModelPos;

// Returns 1.0 outside the crater, 0.0 inside, with a soft edge.
float crater(vec2 uv, vec2 centre, float radius) {
    return smoothstep(radius - 0.04, radius + 0.01, distance(uv, centre));
}

void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);

    // Core point light
    vec3  toCore   = uCorePos - vWorldPos;
    float coreDist = length(toCore);
    vec3  L_core   = toCore / coreDist;
    float atten    = uCoreIntens / (1.0 + 0.006 * coreDist * coreDist);
    float d_core   = max(dot(N, L_core), 0.0) * atten;
    float d_rim    = max(dot(N, normalize(uRimDir)), 0.0) * 0.5;

    float brightness = clamp(d_core + d_rim, 0.0, 1.0);
    float cel;
    if      (brightness > 0.55) cel = 1.0;
    else if (brightness > 0.20) cel = 0.55;
    else                        cel = 0.28;

    vec3 baseColor = vColor;

    // ── Crater pits ──────────────────────────────────────────────────────────
    // Three overlapping craters per face at fixed UV positions.
    // All six faces share the same UV space so craters appear on every side.
    float c1 = crater(vUv, vec2(0.28, 0.32), 0.14);
    float c2 = crater(vUv, vec2(0.65, 0.58), 0.10);
    float c3 = crater(vUv, vec2(0.45, 0.72), 0.07);
    float craterMask = min(min(c1, c2), c3);   // 0 = inside a pit

    baseColor = mix(baseColor * 0.30, baseColor, craterMask);  // darken craters

    // Lit + ambient
    vec3 lit   = baseColor * cel;
    vec3 amb   = uAmbient * baseColor;
    vec3 color = max(lit, amb);

    // Silhouette darkening
    float edge = smoothstep(0.0, 0.28, max(dot(N, V), 0.0));
    color *= mix(0.15, 1.0, edge);

    gl_FragColor = vec4(color, 1.0);
}
