// ── Voxel terrain vertex shader (GLSL ES 3.00 / WebGL 2) ───────────────────
// The terrain mesh is built entirely on the CPU: top quads + vertical wall
// quads with baked normals.  This shader is a plain MVP transform.

out vec3  vNormal;
out vec3  vWorldPos;
out float vHeight;

void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos     = worldPos.xyz;
    vHeight       = position.y;
    vNormal       = normalize(normalMatrix * normal);
    gl_Position   = projectionMatrix * viewMatrix * worldPos;
}
