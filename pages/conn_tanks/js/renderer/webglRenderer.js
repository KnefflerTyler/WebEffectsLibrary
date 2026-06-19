'use strict';

import { loadGLSL } from '../../../shared/loadGLSL.js';

const base = new URL('../glsl/', import.meta.url);

export class WebGLRenderer {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
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

}

export default WebGLRenderer;