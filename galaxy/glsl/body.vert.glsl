// Outputs vNormal, vWorldPos, vUv, vColor for all galaxy body fragment shaders.
// Works with InstancedMesh — Three.js automatically expands
// projectionMatrix / modelViewMatrix / normalMatrix per instance.
// When vertexColors:true, Three.js injects a built-in `color` attribute
// (vec3) populated from instanceColor.

varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vUv;
varying vec3 vColor;

void main() {
    vUv       = uv;
    vColor    = color;   // injected by Three.js from instanceColor buffer
    vNormal   = normalize(normalMatrix * normal);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
