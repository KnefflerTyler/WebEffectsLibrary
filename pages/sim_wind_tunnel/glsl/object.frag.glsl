// ── Object fragment shader ────────────────────────────────────────────────────
// Metallic appearance with:
//   • Blinn-Phong diffuse + specular
//   • Fresnel rim glow
//   • Pressure coefficient (Cp) surface map, sourced from whichever is available:
//       uUseCpMap = 1  — simulation-derived 128×64 equirectangular texture
//                        built by pressureMap.js after multi-pass integration
//       uUseCpMap = 0  — analytical potential-flow formula (fallback / pre-sim)
//
// Texture UV convention (must match pressureMap.js):
//   u = atan(dir.x, dir.z) / (2π) + 0.5    (longitude, wraps at seam)
//   v = acos(dir.y) / π                     (colatitude, 0=+Y top 1=−Y bottom)

precision highp float;

uniform vec3      uBaseColor;  // main albedo
uniform vec3      uRimColor;   // Fresnel rim glow colour
uniform vec3      uLightDir;   // world-space normalised key light direction
uniform vec3      uObjCenter;  // world-space object centroid
uniform float     uSimDone;    // 0 = plain metallic, 1 = Cp pressure colours
uniform sampler2D uCpMap;      // sim-derived Cp texture (R channel, normalised)
uniform float     uUseCpMap;   // 0 = analytical formula, 1 = sim texture

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

    // ── Pressure coefficient (Cp) surface map ────────────────────────────────────
    // Direction from object centre to this surface fragment.
    vec3  dir  = normalize(vWorldPos - uObjCenter);

    // ---- Analytical fallback: Cp(θ) = (9/4)cos²θ − 5/4, flow is +Z ----
    float cosT      = -dir.z;                            // θ measured from upstream stagnation
    float Cp_analyt = 2.25 * cosT * cosT - 1.25;        // ∈ [−1.25, +1.0]
    float t_analyt  = (Cp_analyt + 1.25) / 2.25;

    // ---- Simulation-derived Cp: spherical UV lookup into pressureMap texture ----
    // u = longitude  = atan2(dir.x, dir.z) / 2π + 0.5
    // v = colatitude = acos(dir.y) / π
    const float PI = 3.14159265;
    float phi   = atan(dir.x, dir.z) / (2.0 * PI) + 0.5;
    float theta = acos(clamp(dir.y, -1.0, 1.0)) / PI;
    float t_sim = texture2D(uCpMap, vec2(phi, theta)).r;

    // Blend: analytical when no texture, sim-derived when texture is ready.
    float t_cp = mix(t_analyt, t_sim, uUseCpMap);
    vec3  cpCol = cpRamp(t_cp);

    // ── Final colour: blend Blinn-Phong metallic look with Cp map ────────────
    vec3 base  = uBaseColor * (0.18 + 0.72 * diff)
               + vec3(0.75, 0.85, 1.0) * spec * 0.55
               + uRimColor * rim * 1.8;

    // Cp colouring is only active after a simulation has been run.
    // uSimDone: 0 = plain metallic, 1 = full Cp blend (50% Cp + 50% lighting).
    vec3 col = mix(base, mix(base, cpCol * (0.35 + 0.65 * diff), 0.52), uSimDone);

    gl_FragColor = vec4(col, 1.0);
}
