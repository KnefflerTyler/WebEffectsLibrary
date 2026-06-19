#version 300 es
precision mediump float;

in vec2 vUv;
uniform sampler2D uTexture;
uniform vec4 uFrame;
out vec4 outColor;

void main() {
  vec4 color = texture(uTexture, uFrame.zw + vUv * uFrame.xy);
  if (color.a < 0.02) discard;
  outColor = color;
}
