// ── Object fragment shader ────────────────────────────────────────────────────
// Metallic appearance with:
//   • Blinn-Phong diffuse + specular
//   • Fresnel rim glow (highlights silhouette against flow)
//   • Pressure coefficient (Cp) surface map — computed from potential-flow theory
//     using the fragment's world position relative to the object centre.
//     Cp = +1 at the upstream stagnation point (red)
//     Cp = −1.25 at the equator suction peak (blue)
//     This matches the CFD-standard cool-warm pressure colour convention.

precision highp float;

uniform vec3  uBaseColor;  // main albedo
uniform vec3  uRimColor;   // Fresnel rim glow colour
uniform vec3  uLightDir;   // world-space normalised key light direction
uniform vec3  uObjCenter;  // world-space object centroid (for Cp computation)

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vWorldPos;

// CFD cool-warm ramp: blue (Cp_min) → white (Cp≈0) → red (Cp_max)
// t = 0 → deep blue, t = 0.5 → white, t = 1 → bright red
vec3 cpRamp(float t) {
    t = clamp(t, 0.0, 1.0);
    if (t < 0.5) {
        return mix(vec3(0.05, 0.12, 0.88), vec3(1.0, 1.0, 1.0), t * 2.0);
    } else {
        return mix(vec3(1.0, 1.0, 1.0), vec3(0.88, 0.06, 0.06), (t - 0.5) * 2.0);
    }
}

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

    // ── Pressure coefficient (Cp) surface map ────────────────────────────────
    // Use the direction from the object centre to this surface fragment to
    // compute the "effective θ" in potential-flow terms (valid for any convex
    // body since the physics model uses a sphere doublet for all shapes).
    //
    //   Cp(θ) = 1 − (9/4)·sin²θ = (9/4)·cos²θ − 5/4
    //   cosθ  = dot( normalize(worldPos − centre), −Z_flow )
    //         = −dir.z       (flow is +Z)
    //
    vec3  dir  = normalize(vWorldPos - uObjCenter);
    float cosT = -dir.z;                               // cosine of stagnation angle
    float Cp   = 2.25 * cosT * cosT - 1.25;           // ∈ [−1.25, +1.0]

    // Map Cp → t ∈ [0,1]: −1.25 → 0 (blue), 0 → ~0.56 (white), +1.0 → 1 (red)
    float t_cp = (Cp + 1.25) / 2.25;
    vec3  cpCol = cpRamp(t_cp);

    // ── Final colour: blend Blinn-Phong metallic look with Cp map ────────────
    vec3 base  = uBaseColor * (0.18 + 0.72 * diff)
               + vec3(0.75, 0.85, 1.0) * spec * 0.55
               + uRimColor * rim * 1.8;

    // 50% Cp colouring + 50% lighting — preserves 3D form while showing pressure
    vec3 col = mix(base, cpCol * (0.35 + 0.65 * diff), 0.52);

    gl_FragColor = vec4(col, 0.90);
}
