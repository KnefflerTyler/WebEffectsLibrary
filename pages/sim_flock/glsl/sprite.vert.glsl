// Vertex shader for spritesheet-driven 2D sprites
// Expects a quad with `uv` attribute in [0,1]. Uses Three.js built-ins
// (`projectionMatrix`, `modelViewMatrix`) for positioning.

attribute vec3 position;
attribute vec2 uv;

varying vec2 vUv;

void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

