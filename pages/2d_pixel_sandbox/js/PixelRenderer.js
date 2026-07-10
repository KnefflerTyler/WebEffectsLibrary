import { CELL_FLAGS } from './PixelWorld.js';
import { MATERIAL, PIXEL_BY_ID } from './pixel/pixelRegistry.js';

const LAYER_NAMES = ['backdrop', 'background', 'foreground'];

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
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
    layerTint = 0.025;
  } else if (u_layerVisibility.x != 0) {
    state = texelFetch(u_backdropState, cell, 0);
    tint = texelFetch(u_backdropColor, cell, 0);
    layerTint = 0.05;
  } else {
    outColor = vec4(0.02, 0.027, 0.043, 1.0);
    return;
  }

  vec3 color = materialColor(state, tint);
  color = mix(color, vec3(5.0, 7.0, 11.0), layerTint);
  if ((state.a & 1u) != 0u) color = min(vec3(255.0), color + vec3(30.0));
  outColor = vec4(clamp(color / 255.0, 0.0, 1.0), 1.0);
}`;

export class PixelRenderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.world = world;
    this.canvas.width = world.width;
    this.canvas.height = world.height;
    this.stats = { pixels: 0, fires: 0, waters: 0 };
    this.statsTick = -1;
    this.layerVisibility = { backdrop: true, background: true, foreground: true };
    this.uploadBuffers = new Map();
    this.gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });

    if (this.gl) {
      this.initializeWebGL();
    } else {
      this.initializeCanvasFallback();
    }
  }

  initializeWebGL() {
    const gl = this.gl;
    this.program = this.createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
    gl.useProgram(this.program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    this.gpuLayers = {};
    let textureUnit = 0;
    for (const name of LAYER_NAMES) {
      const state = this.createTexture(textureUnit, `u_${name}State`);
      textureUnit++;
      const color = this.createTexture(textureUnit, `u_${name}Color`);
      textureUnit++;
      this.gpuLayers[name] = { state, color };
      this.world.markLayerFullyDirty(this.world.layers[name]);
    }

    const palette = new Float32Array(32 * 3);
    for (const pixel of PIXEL_BY_ID) {
      if (!pixel) continue;
      palette.set(pixel.color, pixel.id * 3);
    }
    gl.uniform3fv(gl.getUniformLocation(this.program, 'u_palette[0]'), palette);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_height'), this.world.height);
    this.visibilityUniform = gl.getUniformLocation(this.program, 'u_layerVisibility');
    this.updateVisibilityUniform();
    gl.viewport(0, 0, this.world.width, this.world.height);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
  }

  createTexture(unit, uniformName) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8UI, this.world.width, this.world.height, 0, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, null);
    gl.uniform1i(gl.getUniformLocation(this.program, uniformName), unit);
    return { texture, unit };
  }

  createProgram(vertexSource, fragmentSource) {
    const gl = this.gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    return program;
  }

  uploadDirtyLayer(name) {
    const regions = this.world.consumeRenderDirty(name);
    for (const dirty of regions) this.uploadDirtyRegion(name, dirty);
  }

  uploadDirtyRegion(name, dirty) {
    const { x, y, width, height } = dirty;
    const count = width * height;
    const byteLength = count * 4;
    let buffers = this.uploadBuffers.get(byteLength);
    if (!buffers) {
      buffers = { state: new Uint8Array(byteLength), color: new Uint8Array(byteLength) };
      this.uploadBuffers.set(byteLength, buffers);
    }
    const stateBytes = buffers.state;
    const colorBytes = buffers.color;
    const layer = this.world.layers[name];
    let p = 0;

    for (let yy = y; yy < y + height; yy++) {
      let index = yy * this.world.width + x;
      for (let xx = 0; xx < width; xx++, index++) {
        stateBytes[p] = layer.cells[index];
        stateBytes[p + 1] = layer.data[index];
        stateBytes[p + 2] = layer.shade[index];
        stateBytes[p + 3] = layer.flags[index];
        colorBytes[p] = layer.tintR[index];
        colorBytes[p + 1] = layer.tintG[index];
        colorBytes[p + 2] = layer.tintB[index];
        colorBytes[p + 3] = 255;
        p += 4;
      }
    }

    const gl = this.gl;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const gpu = this.gpuLayers[name];
    gl.activeTexture(gl.TEXTURE0 + gpu.state.unit);
    gl.bindTexture(gl.TEXTURE_2D, gpu.state.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, width, height, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, stateBytes);
    gl.activeTexture(gl.TEXTURE0 + gpu.color.unit);
    gl.bindTexture(gl.TEXTURE_2D, gpu.color.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, width, height, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, colorBytes);
  }

  render() {
    if (!this.gl) return this.renderCanvasFallback();
    for (const name of LAYER_NAMES) this.uploadDirtyLayer(name);
    this.gl.useProgram(this.program);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
    return this.updateStats();
  }

  setLayerVisibility(name, visible) {
    if (!(name in this.layerVisibility)) throw new Error(`Unknown render layer "${name}".`);
    this.layerVisibility[name] = Boolean(visible);
    if (this.gl) this.updateVisibilityUniform();
  }

  updateVisibilityUniform() {
    this.gl.useProgram(this.program);
    this.gl.uniform3i(
      this.visibilityUniform,
      Number(this.layerVisibility.backdrop),
      Number(this.layerVisibility.background),
      Number(this.layerVisibility.foreground),
    );
  }

  updateStats() {
    if (this.statsTick === this.world.tick) return this.stats;
    let pixels = 0;
    let fires = 0;
    let waters = 0;
    for (const layer of [this.world.layers.background, this.world.layers.foreground]) {
      for (let i = 0; i < this.world.total; i++) {
        const type = layer.cells[i];
        if (type !== MATERIAL.SPACE && !PIXEL_BY_ID[type].gas) pixels++;
        if (type === MATERIAL.FIRE) fires++;
        if (type === MATERIAL.WATER) waters++;
      }
    }
    this.stats = { pixels, fires, waters };
    this.statsTick = this.world.tick;
    return this.stats;
  }

  initializeCanvasFallback() {
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.image = this.ctx.createImageData(this.world.width, this.world.height);
  }

  renderCanvasFallback() {
    const { foreground, background, backdrop } = this.world.layers;
    const out = this.image.data;
    let p = 0;
    for (let i = 0; i < this.world.total; i++) {
      const fgType = foreground.cells[i];
      const bgType = background.cells[i];
      let layer = null;
      let layerTint = 0;
      if (this.layerVisibility.foreground && fgType !== MATERIAL.SPACE && fgType !== MATERIAL.AIR) {
        layer = foreground;
      } else if (this.layerVisibility.background && bgType !== MATERIAL.SPACE && bgType !== MATERIAL.AIR) {
        layer = background;
        layerTint = 0.025;
      } else if (this.layerVisibility.backdrop) {
        layer = backdrop;
        layerTint = 0.05;
      }
      if (!layer) {
        out[p++] = 5;
        out[p++] = 7;
        out[p++] = 11;
        out[p++] = 255;
        continue;
      }
      const type = layer.cells[i];
      const color = PIXEL_BY_ID[type].renderColor(layer.shade[i], layer.data[i], [layer.tintR[i], layer.tintG[i], layer.tintB[i]]);
      const highlight = (layer.flags[i] & CELL_FLAGS.STATIC) !== 0 ? 30 : 0;
      out[p++] = Math.min(255, color[0] * (1 - layerTint) + 5 * layerTint + highlight);
      out[p++] = Math.min(255, color[1] * (1 - layerTint) + 7 * layerTint + highlight);
      out[p++] = Math.min(255, color[2] * (1 - layerTint) + 11 * layerTint + highlight);
      out[p++] = 255;
    }
    this.ctx.putImageData(this.image, 0, 0);
    return this.updateStats();
  }
}
