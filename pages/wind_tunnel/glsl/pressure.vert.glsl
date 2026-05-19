// ── Pressure cross-section plane — vertex shader ──────────────────────────────
// Passes world-space position to fragment shader for per-pixel Cp computation.

varying vec3 vWorldPos;

void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos     = worldPos.xyz;
    gl_Position   = projectionMatrix * viewMatrix * worldPos;
}
