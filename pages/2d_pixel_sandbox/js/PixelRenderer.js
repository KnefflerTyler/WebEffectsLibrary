import { CELL_FLAGS } from './PixelWorld.js';
import { MATERIAL, PIXEL_BY_ID } from './pixel/pixelRegistry.js';

const LAYER_NAMES = ['backdrop', 'background', 'foreground'];

export class PixelRenderer {
  static async create(canvas, world) {
    const renderer = new PixelRenderer(canvas, world);
    await renderer.initialize();
    return renderer;
  }

  constructor(canvas, world) {
    this.canvas = canvas;
    this.world = world;
    this.canvas.width = world.width;
    this.canvas.height = world.height;
    this.stats = { pixels: 0, fires: 0, waters: 0 };
    this.statsTick = -1;
    this.layerVisibility = { backdrop: true, background: true, foreground: true };
    this.layerOpacity = { foreground: 0.94, background: 0.88, backdrop: 1 };
    this.layerDarkening = { background: 0.10, backdrop: 0.22 };
    this.uploadBuffers = new Map();
    this.gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });

  }

  async initialize() {
    if (!this.gl) {
      this.initializeCanvasFallback();
      return;
    }

    const [vertexSource, fragmentSource] = await Promise.all([
      this.loadShader(new URL('../shaders/pixel.vert.glsl', import.meta.url)),
      this.loadShader(new URL('../shaders/pixel.frag.glsl', import.meta.url)),
    ]);
    this.initializeWebGL(vertexSource, fragmentSource);
  }

  async loadShader(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load shader ${url.pathname}: HTTP ${response.status}`);
    return response.text();
  }

  initializeWebGL(vertexSource, fragmentSource) {
    const gl = this.gl;
    this.program = this.createProgram(vertexSource, fragmentSource);
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
    const materialOpacity = new Float32Array(32);
    const materialEmissive = new Float32Array(32);
    for (const pixel of PIXEL_BY_ID) {
      if (!pixel) continue;
      palette.set(pixel.color, pixel.id * 3);
      materialOpacity[pixel.id] = pixel.opacity;
      materialEmissive[pixel.id] = pixel.emissive;
    }
    gl.uniform3fv(gl.getUniformLocation(this.program, 'u_palette[0]'), palette);
    gl.uniform1fv(gl.getUniformLocation(this.program, 'u_materialOpacity[0]'), materialOpacity);
    gl.uniform1fv(gl.getUniformLocation(this.program, 'u_materialEmissive[0]'), materialEmissive);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_height'), this.world.height);
    this.visibilityUniform = gl.getUniformLocation(this.program, 'u_layerVisibility');
    this.opacityUniform = gl.getUniformLocation(this.program, 'u_layerOpacity');
    this.darkeningUniform = gl.getUniformLocation(this.program, 'u_layerDarkening');
    this.updateVisibilityUniform();
    this.updateOpacityUniform();
    this.updateDarkeningUniform();
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

  setLayerOpacity(name, opacity) {
    if (!(name in this.layerOpacity)) throw new Error(`Unknown opacity layer "${name}".`);
    this.layerOpacity[name] = Math.min(1, Math.max(0, Number(opacity)));
    if (this.gl) this.updateOpacityUniform();
  }

  setLayerDarkening(name, darkening) {
    if (!(name in this.layerDarkening)) throw new Error(`Layer "${name}" does not support darkening.`);
    this.layerDarkening[name] = Math.min(1, Math.max(0, Number(darkening)));
    if (this.gl) this.updateDarkeningUniform();
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

  updateOpacityUniform() {
    this.gl.useProgram(this.program);
    this.gl.uniform3f(
      this.opacityUniform,
      this.layerOpacity.foreground,
      this.layerOpacity.background,
      this.layerOpacity.backdrop,
    );
  }

  updateDarkeningUniform() {
    this.gl.useProgram(this.program);
    this.gl.uniform2f(
      this.darkeningUniform,
      this.layerDarkening.background,
      this.layerDarkening.backdrop,
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
      let color = [5, 7, 11];
      const compositeLayer = (layer, type, opacity, darkening = 0) => {
        const finalOpacity = opacity * PIXEL_BY_ID[type].opacity;
        const layerColor = PIXEL_BY_ID[type].renderColor(layer.shade[i], layer.data[i], [layer.tintR[i], layer.tintG[i], layer.tintB[i]]);
        const highlight = (layer.flags[i] & CELL_FLAGS.STATIC) !== 0 ? 30 : 0;
        const brightness = 1 - darkening * (1 - PIXEL_BY_ID[type].emissive);
        color = color.map((channel, index) => (
          channel * (1 - finalOpacity) + Math.min(255, layerColor[index] + highlight) * brightness * finalOpacity
        ));
      };

      if (this.layerVisibility.backdrop) {
        compositeLayer(backdrop, backdrop.cells[i], this.layerOpacity.backdrop, this.layerDarkening.backdrop);
      }
      if (this.layerVisibility.background && bgType !== MATERIAL.SPACE && bgType !== MATERIAL.AIR) {
        compositeLayer(background, bgType, this.layerOpacity.background, this.layerDarkening.background);
      }
      if (this.layerVisibility.foreground && fgType !== MATERIAL.SPACE && fgType !== MATERIAL.AIR) {
        compositeLayer(foreground, fgType, this.layerOpacity.foreground);
      }

      out[p++] = Math.min(255, color[0]);
      out[p++] = Math.min(255, color[1]);
      out[p++] = Math.min(255, color[2]);
      out[p++] = 255;
    }
    this.ctx.putImageData(this.image, 0, 0);
    return this.updateStats();
  }
}
