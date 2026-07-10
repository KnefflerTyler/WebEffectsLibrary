#version 300 es

precision highp float;
precision highp usampler2D;

uniform usampler2D u_backdropState;
uniform usampler2D u_backdropColor;
uniform usampler2D u_backgroundState;
uniform usampler2D u_backgroundColor;
uniform usampler2D u_foregroundState;
uniform usampler2D u_foregroundColor;
uniform vec3 u_palette[32];
uniform int u_height;
uniform ivec3 u_layerVisibility;
out vec4 outColor;

bool transparentType(uint type) {
  return type == 0u || type == 14u;
}

vec3 materialColor(uvec4 state, uvec4 tint) {
  int type = int(state.r);
  float value = float(state.g);
  float tone = float(state.b);
  vec3 base = (type == 18 || type == 19) ? vec3(tint.rgb) : u_palette[type];

  if (type == 0) return base;
  if (type == 1) {
    float wobble = mod(tone, 23.0) - 11.0;
    return vec3(base.r + wobble, base.g + floor(wobble * 0.6), base.b + mod(tone, 18.0));
  }
  if (type == 4) {
    float hot = min(1.0, value / 36.0);
    return vec3(225.0 + floor(30.0 * hot), 62.0 + floor(132.0 * hot) + mod(tone, 24.0), 14.0 + floor(28.0 * hot));
  }
  if (type == 5) {
    float wobble = mod(tone, 23.0) - 11.0;
    float fade = clamp(value / 56.0, 0.0, 1.0);
    float v = 35.0 + floor(58.0 * fade) + floor(wobble * 0.5);
    return vec3(v, v + 4.0, v + 2.0);
  }
  if (type == 6) {
    float fade = clamp(value / 50.0, 0.0, 1.0);
    float v = 130.0 + floor(78.0 * fade) + mod(tone, 14.0);
    return vec3(v, min(235.0, v + 14.0), min(245.0, v + 20.0));
  }
  if (type == 7) {
    float wobble = mod(tone, 17.0) - 8.0;
    float wet = clamp(value / 240.0, 0.0, 1.0);
    return vec3(72.0 + floor(28.0 * (1.0 - wet)) + wobble, 63.0 + floor(20.0 * (1.0 - wet)) + wobble, 54.0 + floor(10.0 * wet) + wobble);
  }
  if (type == 10) {
    float sprout = min(1.0, value / 96.0);
    float wobble = mod(tone, 13.0) - 6.0;
    return vec3(165.0 + floor(34.0 * (1.0 - sprout)) + wobble, 108.0 + floor(58.0 * sprout) + wobble, 48.0 + floor(18.0 * sprout));
  }
  if (type == 11) {
    float wobble = mod(tone, 21.0) - 10.0;
    return vec3(base.r + floor(wobble * 0.4), base.g + wobble, base.b + floor(wobble * 0.5));
  }
  if (type == 12) {
    float wobble = mod(tone, 17.0) - 8.0;
    return vec3(base.r + wobble, base.g + floor(wobble * 0.7), base.b + floor(wobble * 0.4));
  }
  if (type == 13 || type == 15) {
    float shimmer = mod(tone, type == 13 ? 9.0 : 8.0);
    return base + vec3(shimmer, shimmer, shimmer * 2.0);
  }
  if (type == 14) {
    float shimmer = mod(tone, 7.0);
    return base + vec3(shimmer);
  }
  if (type == 16) {
    float glow = mod(tone, 11.0);
    return vec3(base.r + glow, base.g + floor(glow * 0.5), base.b);
  }
  if (type == 17) {
    float wobble = mod(tone, 19.0) - 9.0;
    return vec3(base.r + floor(wobble * 0.5), base.g + wobble, base.b + floor(wobble * 0.6));
  }
  if (type == 18) {
    float weave = mod(tone, 17.0) - 8.0;
    float stripe = mod(value, 3.0) == 0.0 ? 10.0 : 0.0;
    return vec3(base.r + weave + stripe, base.g + floor(weave * 0.55) + stripe, base.b + floor(weave * 0.45) + stripe);
  }
  if (type == 19) {
    float glow = min(22.0, floor(value / 6.0)) + mod(tone, 7.0);
    return min(vec3(255.0), base + vec3(glow));
  }

  float wobble = mod(tone, 23.0) - 11.0;
  return base + vec3(wobble);
}

void main() {
  ivec2 cell = ivec2(int(gl_FragCoord.x), u_height - 1 - int(gl_FragCoord.y));
  uvec4 fgState = texelFetch(u_foregroundState, cell, 0);
  uvec4 bgState = texelFetch(u_backgroundState, cell, 0);
  uvec4 state;
  uvec4 tint;
  float layerTint = 0.0;

  if (u_layerVisibility.z != 0 && !transparentType(fgState.r)) {
    state = fgState;
    tint = texelFetch(u_foregroundColor, cell, 0);
  } else if (u_layerVisibility.y != 0 && !transparentType(bgState.r)) {
    state = bgState;
    tint = texelFetch(u_backgroundColor, cell, 0);
    layerTint = 0.05;
  } else if (u_layerVisibility.x != 0) {
    state = texelFetch(u_backdropState, cell, 0);
    tint = texelFetch(u_backdropColor, cell, 0);
    layerTint = 0.10;
  } else {
    outColor = vec4(0.02, 0.027, 0.043, 1.0);
    return;
  }

  vec3 color = materialColor(state, tint);
  color = mix(color, vec3(5.0, 7.0, 11.0), layerTint);
  if ((state.a & 1u) != 0u) color = min(vec3(255.0), color + vec3(30.0));
  outColor = vec4(clamp(color / 255.0, 0.0, 1.0), 1.0);
}
