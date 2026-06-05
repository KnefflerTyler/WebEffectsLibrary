// ── Streamer fragment shader ──────────────────────────────────────────────────
// Output is used with THREE.AdditiveBlending:
//   finalRGB = vColor * vAlpha  +  dstRGB
// This gives neon-glow streaks that bloom where many streamers overlap.

precision mediump float;

varying vec3  vColor;
varying float vAlpha;

void main() {
    if (vAlpha < 0.01) discard;    // skip invisible tail fragments
    gl_FragColor = vec4(vColor, vAlpha);
}
