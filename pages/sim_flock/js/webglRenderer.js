'use strict';

import Sprite from './sprite/sprite.js';
import { loadGLSL } from '../../../shared/loadGLSL.js';

const base = new URL('../glsl/', import.meta.url);

export class WebGLRenderer {
    constructor(canvas, options = {}) {
        this.canvas = canvas;

        this.gl = canvas.getContext('webgl2', {
            alpha: false,
            antialias: false,
            depth: false,
            stencil: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance'
        });

        if (!this.gl) {
            throw new Error('WebGL2 is required for WebGLRenderer.');
        }

        this.width = 0;
        this.height = 0;
        this.dpr = Math.max(1, window.devicePixelRatio || 1);

        this.enableCulling = options.enableCulling ?? true;
        this.cullMargin = options.cullMargin ?? 80;
        this.maxInstancesPerBatch = options.maxInstancesPerBatch ?? 20000;

        this.backgroundColor = options.backgroundColor ?? [0.04, 0.05, 0.08, 1.0];
        this.alphaCutoff = options.alphaCutoff ?? 0.01;

        this.debugColliders = options.debugColliders ?? false;

        this.vertexShaderPath =
            options.vertexShaderPath ??
            new URL('sprite_instanced.vert.glsl', base);

        this.fragmentShaderPath =
            options.fragmentShaderPath ??
            new URL('sprite_instanced.frag.glsl', base);

        this.stats = {
            totalSprites: 0,
            renderedSprites: 0,
            culledSprites: 0,
            drawCalls: 0,
            batches: 0,
            textures: 0,
            colliderOutlines: 0
        };

        this.textureMap = new Map();
        this.batches = new Map();

        /*
            Per-instance data:

            0  x
            1  y
            2  width
            3  height

            4  rotation
            5  alpha

            6  cols
            7  rows
            8  row
            9  startCol

            10 endCol
            11 animSpeed
            12 animTime
            13 frameOffset
        */
        this.floatsPerInstance = 14;
        this.instanceData = new Float32Array(
            this.maxInstancesPerBatch * this.floatsPerInstance
        );

        this.program = null;
        this.vao = null;
        this.vertexBuffer = null;
        this.indexBuffer = null;
        this.instanceBuffer = null;
        this.uniforms = {};

        this.debugCanvas = null;
        this.debugCtx = null;
        this.ownsDebugCanvas = false;

        this.initialized = false;

        this.initDebugCanvas(options.debugCanvas ?? null);
    }

    static async create(canvas, options = {}) {
        const renderer = new WebGLRenderer(canvas, options);
        await renderer.init();
        return renderer;
    }

    async init() {
        const vertexSource = await loadGLSL(this.vertexShaderPath);
        const fragmentSource = await loadGLSL(this.fragmentShaderPath);

        this.initGL(vertexSource, fragmentSource);
        this.resize();

        this.initialized = true;

        return this;
    }

    initDebugCanvas(existingCanvas = null) {
        if (existingCanvas) {
            this.debugCanvas = existingCanvas;
            this.ownsDebugCanvas = false;
        } else {
            this.debugCanvas = document.createElement('canvas');
            this.ownsDebugCanvas = true;

            const parent = this.canvas.parentElement || document.body;
            parent.appendChild(this.debugCanvas);
        }

        this.debugCtx = this.debugCanvas.getContext('2d');

        this.debugCanvas.style.position = 'absolute';
        this.debugCanvas.style.left = this.canvas.style.left || '0';
        this.debugCanvas.style.top = this.canvas.style.top || '0';
        this.debugCanvas.style.width = '100vw';
        this.debugCanvas.style.height = '100vh';
        this.debugCanvas.style.pointerEvents = 'none';
        this.debugCanvas.style.zIndex = '10';
    }

    initGL(vertexSource, fragmentSource) {
        const gl = this.gl;

        const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);

        this.program = this.createProgram(vertexShader, fragmentShader);

        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);

        gl.useProgram(this.program);

        this.uniforms.uResolution = gl.getUniformLocation(this.program, 'uResolution');
        this.uniforms.uTexture = gl.getUniformLocation(this.program, 'uTexture');
        this.uniforms.uAlphaCutoff = gl.getUniformLocation(this.program, 'uAlphaCutoff');

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        const vertices = new Float32Array([
            0, 0,
            1, 0,
            1, 1,
            0, 1
        ]);

        const indices = new Uint16Array([
            0, 1, 2,
            0, 2, 3
        ]);

        this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(
            0,
            2,
            gl.FLOAT,
            false,
            2 * Float32Array.BYTES_PER_ELEMENT,
            0
        );

        this.indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        this.instanceBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);

        const stride = this.floatsPerInstance * Float32Array.BYTES_PER_ELEMENT;

        // location 1: x, y, width, height
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(
            1,
            4,
            gl.FLOAT,
            false,
            stride,
            0
        );
        gl.vertexAttribDivisor(1, 1);

        // location 2: rotation, alpha
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(
            2,
            2,
            gl.FLOAT,
            false,
            stride,
            4 * Float32Array.BYTES_PER_ELEMENT
        );
        gl.vertexAttribDivisor(2, 1);

        // location 3: cols, rows, row, startCol
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(
            3,
            4,
            gl.FLOAT,
            false,
            stride,
            6 * Float32Array.BYTES_PER_ELEMENT
        );
        gl.vertexAttribDivisor(3, 1);

        // location 4: endCol, animSpeed, animTime, frameOffset
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(
            4,
            4,
            gl.FLOAT,
            false,
            stride,
            10 * Float32Array.BYTES_PER_ELEMENT
        );
        gl.vertexAttribDivisor(4, 1);

        gl.bindVertexArray(null);

        gl.useProgram(this.program);
        gl.uniform1i(this.uniforms.uTexture, 0);
        gl.uniform1f(this.uniforms.uAlphaCutoff, this.alphaCutoff);

        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    createShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);

        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(`Shader compile error: ${info}`);
        }

        return shader;
    }

    createProgram(vertexShader, fragmentShader) {
        const gl = this.gl;
        const program = gl.createProgram();

        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const info = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            throw new Error(`Program link error: ${info}`);
        }

        return program;
    }

    resize() {
        const gl = this.gl;

        this.dpr = Math.max(1, window.devicePixelRatio || 1);

        this.width = window.innerWidth;
        this.height = window.innerHeight;

        this.canvas.width = Math.floor(this.width * this.dpr);
        this.canvas.height = Math.floor(this.height * this.dpr);

        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;

        gl.viewport(0, 0, this.canvas.width, this.canvas.height);

        this.resizeDebugCanvas();
    }

    resizeDebugCanvas() {
        if (!this.debugCanvas || !this.debugCtx) return;

        this.debugCanvas.width = Math.floor(this.width * this.dpr);
        this.debugCanvas.height = Math.floor(this.height * this.dpr);

        this.debugCanvas.style.width = `${this.width}px`;
        this.debugCanvas.style.height = `${this.height}px`;

        this.debugCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    render(sprites = []) {
        if (!this.initialized) return;

        const gl = this.gl;

        const stats = this.stats;
        stats.totalSprites = sprites.length;
        stats.renderedSprites = 0;
        stats.culledSprites = 0;
        stats.drawCalls = 0;
        stats.batches = 0;
        stats.textures = this.textureMap.size;
        stats.colliderOutlines = 0;

        const bg = this.backgroundColor;
        gl.clearColor(bg[0], bg[1], bg[2], bg[3]);
        gl.clear(gl.COLOR_BUFFER_BIT);

        if (sprites && sprites.length > 0) {
            this.buildBatches(sprites);
            this.drawBatches();
        }

        if (this.debugColliders || Sprite.debugColliders) {
            this.drawColliderOutlines(sprites);
        } else {
            this.clearColliderOutlines();
        }
    }

    buildBatches(sprites) {
        const batches = this.batches;
        batches.clear();

        const margin = this.enableCulling ? this.cullMargin : 999999;
        const minX = -margin;
        const minY = -margin;
        const maxX = this.width + margin;
        const maxY = this.height + margin;

        for (let i = 0; i < sprites.length; i++) {
            const sprite = sprites[i];
            if (!sprite) continue;

            const image = this.getSpriteImage(sprite);
            if (!image || !this.isImageReady(image)) continue;

            if (this.enableCulling && !this.isSpriteVisible(sprite, minX, minY, maxX, maxY, image)) {
                this.stats.culledSprites++;
                continue;
            }

            let batch = batches.get(image);

            if (!batch) {
                batch = [];
                batches.set(image, batch);
            }

            batch.push(sprite);
        }
    }

    drawBatches() {
        const gl = this.gl;

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        gl.uniform2f(this.uniforms.uResolution, this.width, this.height);
        gl.uniform1f(this.uniforms.uAlphaCutoff, this.alphaCutoff);

        gl.activeTexture(gl.TEXTURE0);

        for (const [image, sprites] of this.batches) {
            const texture = this.getTexture(image);
            if (!texture) continue;

            gl.bindTexture(gl.TEXTURE_2D, texture);

            let offset = 0;

            while (offset < sprites.length) {
                const count = Math.min(
                    sprites.length - offset,
                    this.maxInstancesPerBatch
                );

                this.fillInstanceData(sprites, offset, count, image);

                gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
                gl.bufferSubData(
                    gl.ARRAY_BUFFER,
                    0,
                    this.instanceData.subarray(0, count * this.floatsPerInstance)
                );

                gl.drawElementsInstanced(
                    gl.TRIANGLES,
                    6,
                    gl.UNSIGNED_SHORT,
                    0,
                    count
                );

                this.stats.drawCalls++;
                this.stats.batches++;
                this.stats.renderedSprites += count;

                offset += count;
            }
        }

        gl.bindVertexArray(null);
    }

    fillInstanceData(sprites, start, count, image) {
        const data = this.instanceData;

        const imageWidth = image.width || image.videoWidth || 1;
        const imageHeight = image.height || image.videoHeight || 1;

        let ptr = 0;

        for (let i = 0; i < count; i++) {
            const sprite = sprites[start + i];

            const sheet = this.getSpriteSheetData(sprite);

            const cols = Math.max(1, sheet.cols);
            const rows = Math.max(1, sheet.rows);

            const cellWidth = imageWidth / cols;
            const cellHeight = imageHeight / rows;

            const width =
                sprite.width ||
                sprite.renderWidth ||
                sprite.size ||
                cellWidth ||
                imageWidth;

            const height =
                sprite.height ||
                sprite.renderHeight ||
                sprite.size ||
                cellHeight ||
                imageHeight;

            data[ptr++] = sprite.x || 0;
            data[ptr++] = sprite.y || 0;
            data[ptr++] = width;
            data[ptr++] = height;

            data[ptr++] = sprite.rotation || 0;
            data[ptr++] = sprite.alpha ?? 1;

            data[ptr++] = sheet.cols;
            data[ptr++] = sheet.rows;
            data[ptr++] = sheet.row;
            data[ptr++] = sheet.startCol;

            data[ptr++] = sheet.endCol;
            data[ptr++] = sheet.animSpeed;
            data[ptr++] = sheet.animTime;
            data[ptr++] = sheet.frameOffset;
        }
    }

    getSpriteSheetData(sprite) {
        if (sprite && typeof sprite.getUniforms === 'function') {
            const u = sprite.getUniforms();

            if (u && Object.keys(u).length > 0) {
                return {
                    cols: u.uCols ?? 1,
                    rows: u.uRows ?? 1,
                    row: u.uRow ?? 0,
                    startCol: u.uStartCol ?? 0,
                    endCol: u.uEndCol ?? ((u.uCols ?? 1) - 1),
                    animSpeed: u.uAnimSpeed ?? 0,
                    animTime: u.uTime ?? sprite.elapsed ?? 0,
                    frameOffset: u.uFrameOffset ?? 0
                };
            }
        }

        const cols =
            sprite.sheetCols ??
            sprite.cols ??
            sprite.uCols ??
            sprite.animCols ??
            1;

        const rows =
            sprite.sheetRows ??
            sprite.rows ??
            sprite.uRows ??
            sprite.animRows ??
            1;

        const row =
            sprite.row ??
            sprite.frameRow ??
            sprite.animRow ??
            sprite.uRow ??
            0;

        const startCol =
            sprite.startCol ??
            sprite.animStartCol ??
            sprite.uStartCol ??
            0;

        const endCol =
            sprite.endCol ??
            sprite.animEndCol ??
            sprite.uEndCol ??
            cols - 1;

        const animSpeed =
            sprite.animSpeed ??
            sprite.animationSpeed ??
            sprite.uAnimSpeed ??
            0;

        return {
            cols,
            rows,
            row,
            startCol,
            endCol,
            animSpeed,
            animTime: sprite.elapsed ?? 0,
            frameOffset: sprite.frameOffset ?? sprite.uFrameOffset ?? 0
        };
    }

    getSpriteImage(sprite) {
        return sprite.image || sprite.img || sprite.texture || sprite.bitmap || null;
    }

    isImageReady(image) {
        if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
            return true;
        }

        if (image instanceof HTMLCanvasElement) {
            return image.width > 0 && image.height > 0;
        }

        if (image instanceof HTMLVideoElement) {
            return image.readyState >= 2;
        }

        return !!image.complete && image.width > 0 && image.height > 0;
    }

    isSpriteVisible(sprite, minX, minY, maxX, maxY, image) {
        const imageWidth = image?.width || image?.videoWidth || 16;
        const imageHeight = image?.height || image?.videoHeight || 16;

        const sheet = this.getSpriteSheetData(sprite);

        const cellWidth = imageWidth / Math.max(1, sheet.cols);
        const cellHeight = imageHeight / Math.max(1, sheet.rows);

        const width =
            sprite.width ||
            sprite.renderWidth ||
            sprite.size ||
            cellWidth ||
            imageWidth;

        const height =
            sprite.height ||
            sprite.renderHeight ||
            sprite.size ||
            cellHeight ||
            imageHeight;

        const x = sprite.x || 0;
        const y = sprite.y || 0;

        const halfW = width * 0.5;
        const halfH = height * 0.5;

        return !(
            x + halfW < minX ||
            x - halfW > maxX ||
            y + halfH < minY ||
            y - halfH > maxY
        );
    }

    getTexture(image) {
        let texture = this.textureMap.get(image);

        if (texture) {
            return texture;
        }

        texture = this.createTexture(image);
        this.textureMap.set(image, texture);

        return texture;
    }

    createTexture(image) {
        const gl = this.gl;
        const texture = gl.createTexture();

        gl.bindTexture(gl.TEXTURE_2D, texture);

        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            image
        );

        return texture;
    }

    updateTexture(image) {
        const gl = this.gl;
        const texture = this.getTexture(image);

        gl.bindTexture(gl.TEXTURE_2D, texture);

        gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            0,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            image
        );
    }

    deleteTexture(image) {
        const texture = this.textureMap.get(image);

        if (!texture) return;

        this.gl.deleteTexture(texture);
        this.textureMap.delete(image);
    }

    clearTextureCache() {
        for (const texture of this.textureMap.values()) {
            this.gl.deleteTexture(texture);
        }

        this.textureMap.clear();
    }

    clearColliderOutlines() {
        const ctx = this.debugCtx;
        if (!ctx) return;

        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.width, this.height);
    }

    drawColliderOutlines(sprites) {
        const ctx = this.debugCtx;
        if (!ctx) return;

        this.stats.colliderOutlines = 0;

        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.width, this.height);

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);

        for (let i = 0; i < sprites.length; i++) {
            const sprite = sprites[i];
            const collider = sprite?.collider;

            if (!sprite || !collider) continue;

            this.drawSingleColliderOutline(ctx, sprite, collider);
            this.stats.colliderOutlines++;
        }

        ctx.restore();
    }

    drawSingleColliderOutline(ctx, sprite, collider) {
        const pos = this.getColliderWorldPosition(sprite, collider);
        const type = collider.type;

        if (type === 'square' || type === 'rect' || type === 'rectangle') {
            const width = this.getColliderWidth(sprite, collider);
            const height = this.getColliderHeight(sprite, collider);

            ctx.strokeRect(
                pos.x - width * 0.5,
                pos.y - height * 0.5,
                width,
                height
            );

            return;
        }

        const radius = this.getColliderRadius(sprite, collider);

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.stroke();
    }

    getColliderWorldPosition(sprite, collider) {
        if (typeof collider.worldPos === 'function') {
            return collider.worldPos();
        }

        return {
            x: collider.x ?? sprite.x ?? 0,
            y: collider.y ?? sprite.y ?? 0
        };
    }

    getColliderWidth(sprite, collider) {
        const width =
            collider.width ??
            ((collider.halfWidth ?? 0) * 2);

        return (
            width ||
            sprite.width ||
            sprite.renderWidth ||
            sprite.size ||
            16
        );
    }

    getColliderHeight(sprite, collider) {
        const height =
            collider.height ??
            ((collider.halfHeight ?? 0) * 2);

        return (
            height ||
            sprite.height ||
            sprite.renderHeight ||
            sprite.size ||
            16
        );
    }

    getColliderRadius(sprite, collider) {
        const spriteSize = Math.max(
            sprite.width || sprite.renderWidth || sprite.size || 0,
            sprite.height || sprite.renderHeight || sprite.size || 0
        );

        const radius =
            collider.radius ??
            spriteSize * 0.5;

        return radius || 8;
    }

    getStats() {
        return { ...this.stats };
    }

    destroy() {
        const gl = this.gl;

        this.clearTextureCache();

        if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer);
        if (this.indexBuffer) gl.deleteBuffer(this.indexBuffer);
        if (this.instanceBuffer) gl.deleteBuffer(this.instanceBuffer);
        if (this.vao) gl.deleteVertexArray(this.vao);
        if (this.program) gl.deleteProgram(this.program);

        if (this.debugCanvas && this.ownsDebugCanvas && this.debugCanvas.parentElement) {
            this.debugCanvas.parentElement.removeChild(this.debugCanvas);
        }

        this.vertexBuffer = null;
        this.indexBuffer = null;
        this.instanceBuffer = null;
        this.vao = null;
        this.program = null;

        this.debugCanvas = null;
        this.debugCtx = null;
    }
}

export default WebGLRenderer;