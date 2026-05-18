// ── Object vertex shader ──────────────────────────────────────────────────────
// Phong-style shading with per-pixel normals.
// Three.js auto-injects: modelMatrix, viewMatrix, projectionMatrix,
//   modelViewMatrix, normalMatrix, position (vec3), normal (vec3).

varying vec3 vNormal;
varying vec3 vViewDir;   // view-space view direction (from fragment toward camera)
varying vec3 vWorldPos;

void main() {
    vec4 worldPos4 = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos4.xyz;

    // Transform normal to world space
    vNormal = normalize(normalMatrix * normal);

    // View direction in view space (eye at origin in view space)
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir   = normalize(-mvPos.xyz);

    gl_Position = projectionMatrix * mvPos;
}
