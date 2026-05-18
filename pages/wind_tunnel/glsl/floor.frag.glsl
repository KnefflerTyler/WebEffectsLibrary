// ── Floor fragment shader ─────────────────────────────────────────────────────
// Fully procedural checkerboard + animated grid glow — no CPU canvas needed.
//
// uTime     — elapsed seconds (drives the flow-direction glow pulse)
// uTileSize — world-units per checker tile

precision highp float;

uniform float uTime;
uniform float uTileSize;

varying vec3 vWorldPos;

void main() {
    vec2 p = vWorldPos.xz / uTileSize;   // tile-space coords in XZ plane

    // ── Checkerboard ──────────────────────────────────────────────────────────
    vec2  tIdx    = floor(p);
    float checker = mod(tIdx.x + tIdx.y, 2.0);

    vec3 colA = vec3(0.043, 0.078, 0.149);  // #0b1426
    vec3 colB = vec3(0.035, 0.063, 0.126);  // #091020
    vec3 tileColor = mix(colA, colB, checker);

    // ── Grid lines (thin border at tile edges) ─────────────────────────────────
    vec2  fr    = fract(p);
    float lineW = 0.04;
    float line  = clamp(step(1.0 - lineW, fr.x) + step(1.0 - lineW, fr.y), 0.0, 1.0);

    // ── Animated flow-direction pulse ─────────────────────────────────────────
    // Two travelling waves in +Z (flow direction), slightly offset
    float wave1 = 0.50 + 0.50 * sin(uTime * 0.90 - vWorldPos.z * 0.40);
    float wave2 = 0.45 + 0.55 * sin(uTime * 1.30 - vWorldPos.z * 0.60 + vWorldPos.x * 0.10);
    float glow  = wave1 * wave2;

    vec3 glowColor = vec3(0.07, 0.17, 0.52) * glow
                   + vec3(0.02, 0.08, 0.28) * (1.0 - glow);

    // ── Compose ───────────────────────────────────────────────────────────────
    vec3 finalColor = mix(tileColor, glowColor, line * 0.70);

    gl_FragColor = vec4(finalColor, 1.0);
}
