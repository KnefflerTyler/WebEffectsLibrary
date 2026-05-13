// ── Terrain vertex shader ─────────────────────────────────────────────────────
// Three.js injects: modelMatrix, viewMatrix, modelViewMatrix, projectionMatrix,
// normalMatrix, position, normal.

varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vHeight;

void main() {
    vec4 worldPos   = modelMatrix * vec4(position, 1.0);
    vWorldPos       = worldPos.xyz;
    vHeight         = worldPos.y;
    vNormal         = normalize(normalMatrix * normal);
    gl_Position     = projectionMatrix * viewMatrix * worldPos;
}
