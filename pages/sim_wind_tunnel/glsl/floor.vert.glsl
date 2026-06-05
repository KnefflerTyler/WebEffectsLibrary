// ── Floor vertex shader ───────────────────────────────────────────────────────
// Passes world-space XZ position to the fragment shader for procedural tiling.

varying vec3 vWorldPos;

void main() {
    vWorldPos   = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
