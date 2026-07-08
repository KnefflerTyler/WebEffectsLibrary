import { loadGLSL } from '../../../../shared/loadGLSL.js';

const shaderBase = new URL('../../glsl/', import.meta.url);
const lineVertexSource = `#version 300 es
layout(location = 0) in vec2 aPosition;
uniform vec2 uResolution;

void main() {
  vec2 clip = aPosition / uResolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;
const lineFragmentSource = `#version 300 es
precision mediump float;
uniform vec4 uColor;
out vec4 outColor;

void main() {
  outColor = uColor;
}
`;

export class WebGLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', { alpha: false, antialias: true });
    if (!this.gl) throw new Error('WebGL2 is required to play Connected Tanks.');
    this.textures = new WeakMap();
  }

  static async create(canvas) {
    const renderer = new WebGLRenderer(canvas);
    await renderer.init();
    return renderer;
  }

  async init() {
    const [vertex, fragment] = await Promise.all([
      loadGLSL(new URL('sprite.vert.glsl', shaderBase)),
      loadGLSL(new URL('sprite.frag.glsl', shaderBase))
    ]);

    this.program = this.createProgram(vertex, fragment);
    this.lineProgram = this.createProgram(lineVertexSource, lineFragmentSource);
    this.uniforms = {
      center: this.gl.getUniformLocation(this.program, 'uCenter'),
      originOffset: this.gl.getUniformLocation(this.program, 'uOriginOffset'),
      size: this.gl.getUniformLocation(this.program, 'uSize'),
      resolution: this.gl.getUniformLocation(this.program, 'uResolution'),
      rotation: this.gl.getUniformLocation(this.program, 'uRotation'),
      texture: this.gl.getUniformLocation(this.program, 'uTexture'),
      frame: this.gl.getUniformLocation(this.program, 'uFrame'),
      backgroundKey: this.gl.getUniformLocation(this.program, 'uBackgroundKey')
    };
    this.lineUniforms = {
      resolution: this.gl.getUniformLocation(this.lineProgram, 'uResolution'),
      color: this.gl.getUniformLocation(this.lineProgram, 'uColor')
    };

    const vertices = new Float32Array([
      -.5, -.5, 0, 0,  .5, -.5, 1, 0,
       .5,  .5, 1, 1, -.5, -.5, 0, 0,
       .5,  .5, 1, 1, -.5,  .5, 0, 1
    ]);
    this.vao = this.gl.createVertexArray();
    this.gl.bindVertexArray(this.vao);
    const buffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
    this.gl.enableVertexAttribArray(0);
    this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 16, 0);
    this.gl.enableVertexAttribArray(1);
    this.gl.vertexAttribPointer(1, 2, this.gl.FLOAT, false, 16, 8);

    this.lineVao = this.gl.createVertexArray();
    this.gl.bindVertexArray(this.lineVao);
    this.lineBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.lineBuffer);
    this.gl.enableVertexAttribArray(0);
    this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 8, 0);

    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.width = width;
    this.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  render(sprites, { shapes = [], screenWrap = false, debugLines = [] } = {}) {
    const gl = this.gl;
    this.resize();
    gl.clearColor(.055, .085, .06, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.renderShapes(shapes);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.uniforms.resolution, this.width, this.height);
    gl.uniform1i(this.uniforms.texture, 0);

    for (const sprite of sprites) {
      if (!sprite.image || !sprite.image.complete || !sprite.image.naturalWidth) continue;
      const frame = sprite.getFrame();
      const frameWidth = 1 / frame.cols;
      const frameHeight = 1 / frame.rows;
      gl.uniform2f(
        this.uniforms.originOffset,
        (sprite.originOffsetX + frame.offsetX) * this.dpr,
        (sprite.originOffsetY + frame.offsetY) * this.dpr
      );
      gl.uniform2f(
        this.uniforms.size,
        sprite.levelSized ? this.width : sprite.width * this.dpr,
        sprite.levelSized ? this.height : sprite.height * this.dpr
      );
      gl.uniform1f(this.uniforms.rotation, sprite.rotation);
      gl.uniform4f(
        this.uniforms.frame,
        frameWidth,
        frameHeight,
        frame.column * frameWidth,
        frame.row * frameHeight
      );
      gl.uniform4f(
        this.uniforms.backgroundKey,
        sprite.backgroundKey?.r ?? 1,
        sprite.backgroundKey?.g ?? 1,
        sprite.backgroundKey?.b ?? 1,
        sprite.backgroundKey?.tolerance ?? 0
      );
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.getTexture(sprite.image));
      for (const position of this.getSpriteRenderPositions(sprite, screenWrap)) {
        gl.uniform2f(this.uniforms.center, position.x * this.width, position.y * this.height);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    }

    this.renderDebugLines(debugLines);
  }

  getSpriteRenderPositions(sprite, screenWrap) {
    const positions = [{ x: sprite.x, y: sprite.y }];
    if (!screenWrap || sprite.wrapWithScreen === false || sprite.levelSized) return positions;

    const radius = Math.hypot(sprite.width, sprite.height) / 2
      + Math.hypot(sprite.originOffsetX ?? 0, sprite.originOffsetY ?? 0);
    const halfWidth = radius * this.dpr / this.width;
    const halfHeight = radius * this.dpr / this.height;
    const offsetsX = [0];
    const offsetsY = [0];
    if (sprite.x - halfWidth < 0) offsetsX.push(1);
    if (sprite.x + halfWidth > 1) offsetsX.push(-1);
    if (sprite.y - halfHeight < 0) offsetsY.push(1);
    if (sprite.y + halfHeight > 1) offsetsY.push(-1);

    return offsetsX.flatMap(offsetX => offsetsY.map(offsetY => ({
      x: sprite.x + offsetX,
      y: sprite.y + offsetY
    })));
  }

  renderShapes(shapes) {
    if (!shapes.length) return;
    const gl = this.gl;
    gl.useProgram(this.lineProgram);
    gl.bindVertexArray(this.lineVao);
    gl.uniform2f(this.lineUniforms.resolution, this.width, this.height);

    for (const shape of shapes) {
      const points = shape.shape === 'screenCircle'
        ? createScreenCirclePoints(shape.center, shape.radius, this.width, this.height)
        : shape.points ?? [];
      if (points.length < 2) continue;
      const vertices = new Float32Array(points.flatMap(point => [
        point.x * this.width,
        point.y * this.height
      ]));
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);

      if (shape.shape !== 'line' && shape.fillAlpha > 0) {
        const fill = colorToRgba(shape.fillColor, shape.fillAlpha);
        gl.uniform4f(this.lineUniforms.color, ...fill);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, points.length);
      }

      if (shape.borderAlpha > 0) {
        const border = colorToRgba(shape.borderColor, shape.borderAlpha);
        gl.uniform4f(this.lineUniforms.color, ...border);
        gl.drawArrays(shape.shape === 'line' ? gl.LINES : gl.LINE_LOOP, 0, points.length);
      }
    }
  }

  renderDebugLines(lines) {
    if (!lines.length) return;

    const gl = this.gl;
    gl.useProgram(this.lineProgram);
    gl.bindVertexArray(this.lineVao);
    gl.uniform2f(this.lineUniforms.resolution, this.width, this.height);
    gl.uniform4f(this.lineUniforms.color, 1, 0.9, 0.2, 0.9);
    gl.lineWidth(2);

    for (const line of lines) {
      const color = line.color ?? [1, 0.9, 0.2, 0.9];
      gl.uniform4f(this.lineUniforms.color, color[0], color[1], color[2], color[3]);
      const vertices = new Float32Array([
        line.start.x * this.width,
        line.start.y * this.height,
        line.end.x * this.width,
        line.end.y * this.height
      ]);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.LINES, 0, 2);
    }
  }

  getTexture(image) {
    if (this.textures.has(image)) return this.textures.get(image);
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    this.textures.set(image, texture);
    return texture;
  }

  createProgram(vertexSource, fragmentSource) {
    const gl = this.gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader));
      }
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }
    return program;
  }
}

function createScreenCirclePoints(center, radius, width, height) {
  if (!center || !radius || !width || !height) return [];
  const radiusY = radius * width / height;
  return Array.from({ length: 32 }, (_, index) => {
    const angle = index / 32 * Math.PI * 2;
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radiusY
    };
  });
}

function colorToRgba(hex, alpha = 1) {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : 'ffffff';
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
    Math.max(0, Math.min(1, Number(alpha) || 0))
  ];
}

export default WebGLRenderer;
