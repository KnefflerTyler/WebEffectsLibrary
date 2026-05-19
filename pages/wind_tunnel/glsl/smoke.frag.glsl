// ── Smoke particle — fragment shader ─────────────────────────────────────────
//
// Renders each billboard as a soft Gaussian puff.
// gl_PointCoord goes from (0,0)→(1,1) across the point sprite quad;
// we re-centre to (-0.5,0.5) and use the radial distance for the falloff.

precision highp float;

varying vec3  vColor;
varying float vAlpha;

uniform float uOpacity;   // UI: Opacity  (default 0.6)
uniform float uDotMode;   // UI: 0=soft puffs, 1=hard dots

void main() {
    vec2  uv = gl_PointCoord - 0.5;
    float r  = length(uv);

    // Discard outside the circle so no hard square edges
    if (r > 0.5) discard;

    // Puff mode: Gaussian falloff (soft centre fades to nothing at r=0.5).
    // Dot mode: flat circle — uniform brightness, hard anti-aliased edge.
    float falloff;
    if (uDotMode > 0.5) {
        falloff = smoothstep(0.5, 0.42, r);   // slight AA at edge
    } else {
        falloff = exp(-7.0 * r * r);
    }

    float alpha = vAlpha * falloff * uOpacity;
    if (alpha < 0.004) discard;

    gl_FragColor = vec4(vColor, alpha);
}
