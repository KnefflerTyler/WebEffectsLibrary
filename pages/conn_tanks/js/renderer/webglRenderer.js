import { loadGLSL } from '../../../../shared/loadGLSL.js';

const shaderBase = new URL('../../glsl/', import.meta.url);

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
    this.uniforms = {
      center: this.gl.getUniformLocation(this.program, 'uCenter'),
      size: this.gl.getUniformLocation(this.program, 'uSize'),
      resolution: this.gl.getUniformLocation(this.program, 'uResolution'),
      rotation: this.gl.getUniformLocation(this.program, 'uRotation'),
      texture: this.gl.getUniformLocation(this.program, 'uTexture'),
      frame: this.gl.getUniformLocation(this.program, 'uFrame')
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

  render(sprites) {
    const gl = this.gl;
    this.resize();
    gl.clearColor(.055, .085, .06, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.uniforms.resolution, this.width, this.height);
    gl.uniform1i(this.uniforms.texture, 0);

    for (const sprite of sprites) {
      if (!sprite.image || !sprite.image.complete || !sprite.image.naturalWidth) continue;
      const frame = sprite.getFrame();
      const frameWidth = 1 / frame.cols;
      const frameHeight = 1 / frame.rows;
      gl.uniform2f(this.uniforms.center, sprite.x * this.width, sprite.y * this.height);
      gl.uniform2f(this.uniforms.size, sprite.width * this.dpr, sprite.height * this.dpr);
      gl.uniform1f(this.uniforms.rotation, sprite.rotation);
      gl.uniform4f(
        this.uniforms.frame,
        frameWidth,
        frameHeight,
        frame.column * frameWidth,
        frame.row * frameHeight
      );
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.getTexture(sprite.image));
      gl.drawArrays(gl.TRIANGLES, 0, 6);
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

export default WebGLRenderer;
