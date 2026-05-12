// Planet — cel shading + equatorial band + polar ice caps.
// Uses vModelPos (object-space, -0.5..+0.5) to add surface features
// that make planets visually distinct from moons and stars.

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

void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);

    // Core point light (attenuated)
    vec3  toCore   = uCorePos - vWorldPos;
    float coreDist = length(toCore);
    vec3  L_core   = toCore / coreDist;
    float atten    = uCoreIntens / (1.0 + 0.006 * coreDist * coreDist);
    float d_core   = max(dot(N, L_core), 0.0) * atten;

    // Rim directional
    float d_rim = max(dot(N, normalize(uRimDir)), 0.0) * 0.5;

    // 3-band cel shading
    float brightness = clamp(d_core + d_rim, 0.0, 1.0);
    float cel;
    if      (brightness > 0.55) cel = 1.0;
    else if (brightness > 0.20) cel = 0.55;
    else                        cel = 0.28;

    vec3 baseColor = vColor;

    // ── Equatorial band ─────────────────────────────────────────────────────
    // vModelPos.y ranges -0.5..+0.5 across the cube's height.
    // A hard band near y=0 on side faces gives a planet belt.
    float band = smoothstep(0.07, 0.11, abs(vModelPos.y));   // 1 outside band, 0 inside
    baseColor = mix(baseColor * 0.45, baseColor, band);        // darken the belt

    // ── Polar ice caps ───────────────────────────────────────────────────────
    // Top/bottom faces (|y| > 0.38) shift toward icy white
    float pole = smoothstep(0.34, 0.48, abs(vModelPos.y));
    baseColor  = mix(baseColor, vec3(0.88, 0.93, 1.0), pole * 0.7);

    // Lit colour + ambient floor
    vec3 lit   = baseColor * cel;
    vec3 amb   = uAmbient * baseColor;
    vec3 color = max(lit, amb);

    // Silhouette darkening (cube edge pop)
    float edge = smoothstep(0.0, 0.28, max(dot(N, V), 0.0));
    color *= mix(0.15, 1.0, edge);

    gl_FragColor = vec4(color, 1.0);
}
