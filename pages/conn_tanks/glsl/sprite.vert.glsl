#version 300 es
layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec2 aUv;

uniform vec2 uCenter;
uniform vec2 uOriginOffset;
uniform vec2 uSize;
uniform vec2 uResolution;
uniform float uRotation;

out vec2 vUv;

void main() {
  vec2 local = aPosition * uSize - uOriginOffset;
  float c = cos(uRotation);
  float s = sin(uRotation);
  vec2 world = uCenter + vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  vec2 clip = world / uResolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vUv = aUv;
}
