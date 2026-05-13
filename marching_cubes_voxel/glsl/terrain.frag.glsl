// ── Voxel terrain fragment shader (GLSL ES 3.00 / WebGL 2) ───────────────────
// Colors top faces as grass and side faces as dirt/rock based on the face
// normal's Y component — all computed on the GPU.
precision highp float;

uniform float uHeightMax;   // heightSteps * cellSize (world units)
uniform vec3  uColorGrass;  // dark grass (low top faces)
uniform vec3  uColorPeak;   // bright grass (high top faces)
uniform vec3  uColorDirt;   // deep dirt (low side faces)
uniform vec3  uColorRock;   // stone (high side faces)
uniform vec3  uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3  uLightDir;    // pre-normalised world-space
uniform float uAmbient;
uniform vec3  uCameraPos;

in vec3  vNormal;
in vec3  vWorldPos;
in float vHeight;

out vec4 fragColor;

void main() {
    vec3  n = normalize(vNormal);

    // ── Height gradient [0..1] ────────────────────────────────────────────────
    float t = clamp(vHeight / uHeightMax, 0.0, 1.0);

    // ── Face type: top (n.y≈1) vs side (n.y≈0) ───────────────────────────────
    float topness = clamp(n.y, 0.0, 1.0);

    vec3 grassColor = mix(uColorGrass, uColorPeak, t);
    vec3 dirtColor  = mix(uColorDirt,  uColorRock, t);
    vec3 albedo     = mix(dirtColor, grassColor, topness * topness); // soft blend

    // ── Diffuse + ambient ─────────────────────────────────────────────────────
    float diff = max(dot(n, uLightDir), 0.0);
    float fill = max(dot(n, -uLightDir), 0.0) * 0.06;
    vec3  lit  = albedo * (uAmbient + diff * (1.0 - uAmbient) + fill);

    // ── Specular (subtle, mainly visible on top faces) ────────────────────────
    vec3  viewDir = normalize(uCameraPos - vWorldPos);
    vec3  halfDir = normalize(uLightDir + viewDir);
    float spec    = pow(max(dot(n, halfDir), 0.0), 16.0) * 0.12 * topness;
    lit += vec3(spec);

    // ── Fog ───────────────────────────────────────────────────────────────────
    float fogDist   = length(vWorldPos.xz - uCameraPos.xz);
    float fogFactor = clamp((fogDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
    fogFactor = fogFactor * fogFactor;

    fragColor = vec4(mix(lit, uFogColor, fogFactor), 1.0);
}
