// ── Terrain fragment shader (GLSL ES 3.00 / WebGL 2) ─────────────────────────
precision highp float;

uniform float uHeightScale;
uniform vec3  uColorLow;
uniform vec3  uColorMid;
uniform vec3  uColorHigh;
uniform vec3  uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3  uLightDir;       // world-space, pre-normalised
uniform float uAmbient;        // [0..1]
uniform vec3  uCameraPos;      // for fog distance calculation

in vec3  vNormal;
in vec3  vWorldPos;
in float vHeight;

out vec4 fragColor;

void main() {
    // ── Height-based albedo ───────────────────────────────────────────────────
    // Map vHeight from [-heightScale .. heightScale] → [0..1]
    float t = clamp((vHeight + uHeightScale) / (2.0 * uHeightScale), 0.0, 1.0);

    vec3 albedo = t < 0.5
        ? mix(uColorLow,  uColorMid,  t * 2.0)
        : mix(uColorMid,  uColorHigh, (t - 0.5) * 2.0);

    // ── Diffuse + ambient lighting ────────────────────────────────────────────
    vec3  n    = normalize(vNormal);
    float diff = max(dot(n, uLightDir), 0.0);

    // Subtle back-fill so deep valleys stay readable
    float fill = max(dot(n, -uLightDir), 0.0) * 0.08;

    vec3 lit = albedo * (uAmbient + diff * (1.0 - uAmbient) + fill);

    // ── Specular highlight (Blinn-Phong) ──────────────────────────────────────
    vec3  viewDir  = normalize(uCameraPos - vWorldPos);
    vec3  halfDir  = normalize(uLightDir + viewDir);
    float spec     = pow(max(dot(n, halfDir), 0.0), 32.0) * 0.25;
    lit += vec3(spec);

    // ── Fog ───────────────────────────────────────────────────────────────────
    float fogDist   = length(vWorldPos.xz - uCameraPos.xz);
    float fogFactor = clamp((fogDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
    // Exponential softening so the cutoff isn't harsh
    fogFactor = fogFactor * fogFactor;

    vec3 color = mix(lit, uFogColor, fogFactor);

    fragColor = vec4(color, 1.0);
}
