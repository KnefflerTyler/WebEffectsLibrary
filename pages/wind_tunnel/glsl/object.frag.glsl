// ── Object fragment shader ────────────────────────────────────────────────────
// Metallic appearance with:
//   • Blinn-Phong diffuse + specular
//   • Fresnel rim glow (highlights silhouette against flow)
//   • Aerodynamic pressure tint (blue upstream / warm downstream)
//     — purely visual, matched to the potential-flow physics

precision highp float;

uniform vec3  uBaseColor;  // main albedo
uniform vec3  uRimColor;   // Fresnel rim glow colour
uniform vec3  uLightDir;   // world-space normalised key light direction

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vWorldPos;

void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vViewDir);
    vec3 L = normalize(uLightDir);

    // ── Blinn-Phong ───────────────────────────────────────────────────────────
    float diff = max(dot(n, L), 0.0);
    vec3  H    = normalize(L + v);
    float spec = pow(max(dot(n, H), 0.0), 56.0);

    // ── Fresnel rim (highlights edges facing away from camera) ────────────────
    float rim = pow(1.0 - max(dot(n, v), 0.0), 3.5);

    // ── Aerodynamic pressure tint ─────────────────────────────────────────────
    // Flow is +Z; upstream stagnation face has outward normal pointing in -Z.
    float upstream   = max(dot(n, vec3(0.0, 0.0, -1.0)), 0.0);  // high pressure
    float downstream = max(dot(n, vec3(0.0, 0.0,  1.0)), 0.0);  // low-pressure wake

    vec3 pressureTint = vec3(0.10, 0.30, 0.95) * upstream   * 0.40
                      + vec3(0.60, 0.12, 0.08) * downstream * 0.18;

    // ── Final colour ──────────────────────────────────────────────────────────
    vec3 col = uBaseColor * (0.18 + 0.72 * diff)
             + vec3(0.75, 0.85, 1.0) * spec * 0.55
             + uRimColor * rim * 1.8
             + pressureTint;

    gl_FragColor = vec4(col, 0.90);
}
