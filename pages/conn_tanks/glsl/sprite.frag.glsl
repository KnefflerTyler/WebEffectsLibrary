#version 300 es
precision mediump float;

in vec2 vUv;
uniform sampler2D uTexture;
uniform vec4 uFrame;
uniform vec4 uBackgroundKey;
out vec4 outColor;

void main() {
  vec4 color = texture(uTexture, uFrame.zw + vUv * uFrame.xy);
  if (color.a < 0.02) discard;
  if (uBackgroundKey.a > 0.0) {
    float channelRange = max(color.r, max(color.g, color.b)) - min(color.r, min(color.g, color.b));
    if (color.r > uBackgroundKey.r && color.g > uBackgroundKey.g && color.b > uBackgroundKey.b && channelRange < uBackgroundKey.a) discard;
  }
  outColor = color;
}
