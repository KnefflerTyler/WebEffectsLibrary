// ── Hex Voxel terrain fragment shader (GLSL ES 3.00 / WebGL 2) ────────────────
// Colors top faces (normal.y≈1) as grass and step edges (normal.y≈0) as
// dirt/rock based on height, then applies diffuse lighting and distance fog.
precision highp float;

uniform float uHeightMax;
uniform vec3  uColorGrass;
uniform vec3  uColorPeak;
uniform vec3  uColorDirt;
uniform vec3  uColorRock;
uniform vec3  uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3  uLightDir;
uniform float uAmbient;
uniform float uBrightness;  // [0..2] overall light multiplier
uniform vec3  uCameraPos;

in vec3  vNormal;
in vec3  vWorldPos;
in float vHeight;

out vec4 fragColor;

void main() {
    vec3 n = normalize(vNormal);

    // Height gradient [0..1]
    float t = clamp(vHeight / uHeightMax, 0.0, 1.0);

    // top face vs step edge
    float topness = clamp(n.y, 0.0, 1.0);

    vec3 grassColor = mix(uColorGrass, uColorPeak, t);
    vec3 dirtColor  = mix(uColorDirt,  uColorRock, t);
    vec3 albedo     = mix(dirtColor, grassColor, topness * topness);

    // Diffuse + ambient
    float diff = max(dot(n, uLightDir), 0.0);
    float fill = max(dot(n, -uLightDir), 0.0) * 0.06;
    vec3  lit  = albedo * (uAmbient + diff * (1.0 - uAmbient) + fill);

    // Specular (subtle, top faces only)
    vec3  viewDir = normalize(uCameraPos - vWorldPos);
    vec3  halfDir = normalize(uLightDir + viewDir);
    float spec    = pow(max(dot(n, halfDir), 0.0), 16.0) * 0.12 * topness;
    lit += vec3(spec);
    lit *= uBrightness;

    // Fog
    float fogDist   = length(vWorldPos.xz - uCameraPos.xz);
    float fogFactor = clamp((fogDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
    fogFactor = fogFactor * fogFactor;

    fragColor = vec4(mix(lit, uFogColor, fogFactor), 1.0);
}
