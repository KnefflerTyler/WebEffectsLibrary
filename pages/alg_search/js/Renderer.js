'use strict';
/* ── Renderer ──────────────────────────────────────────────────────────────
   GPU path  (WebGL2): single full-screen quad per frame. The fragment shader
   colours all cells in parallel by reading a small RGBA8UI state texture.

   State texture layout (cols x rows texels):
     R = state   0=floor 1=room 2=visited 3=path 4=start 5=exit 6=solid
     G = visited intensity 0-255
     B = wall bits  bit0(1)=N  bit1(2)=S  bit2(4)=E  bit3(8)=W
     A = unused

   CPU path (Canvas 2D fallback): fillRect per cell + cached wall canvas.

   Shader source lives in glsl/maze.vert.glsl / glsl/maze.frag.glsl.
   shaders.js mirrors them as JS constants for synchronous access.
*/
class Renderer {
    constructor(canvas) {
        this.canvas   = canvas;
        this.maze     = null;
        this.cellSize = 0;
        this.ox = 0;
        this.oy = 0;

        const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
        if (gl) {
            this.useGL = true;
            this._gl   = gl;
            this._initGL();
        } else {
            this.useGL      = false;
            this._ctx       = canvas.getContext('2d');
            this._wallCache = null;
        }
    }

    get isGPU() { return this.useGL; }

    setMaze(maze) {
        this.maze = maze;
        this._recalc();
        if (this.useGL) { this._bakeWallBits(); this._allocStateTexture(); }
        else            { this._buildWallCache(); }
    }

    resize() {
        if (!this.maze) return;
        this._recalc();
        if (!this.useGL) this._buildWallCache();
    }

    draw(visitedCells = [], visitedCount = 0,
         pathCells    = [], pathCount    = 0,
         algColor = '#4a9eff', pathColor = '#ffd43b') {
        if (this.useGL) this._drawGL(visitedCells, visitedCount, pathCells, pathCount, algColor, pathColor);
        else            this._draw2D(visitedCells, visitedCount, pathCells, pathCount, algColor, pathColor);
    }

    _recalc() {
        const PAD = 20;
        const W = this.canvas.width  - PAD * 2;
        const H = this.canvas.height - PAD * 2;
        this.cellSize = Math.max(3, Math.floor(Math.min(W / this.maze.cols, H / this.maze.rows)));
        this.ox = Math.floor((this.canvas.width  - this.cellSize * this.maze.cols)  / 2);
        this.oy = Math.floor((this.canvas.height - this.cellSize * this.maze.rows) / 2);
    }

    /* ── WebGL2 ──────────────────────────────────────────────────────────── */

    _initGL() {
        const gl = this._gl;
        this._prog = _compileProgram(gl, MAZE_VERT_SRC, MAZE_FRAG_SRC);

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
        const aPos = gl.getAttribLocation(this._prog, 'a_pos');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
        this._vao = vao;

        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this._stateTex = tex;

        gl.useProgram(this._prog);
        this._u = {
            state:      gl.getUniformLocation(this._prog, 'u_state'),
            gridSize:   gl.getUniformLocation(this._prog, 'u_gridSize'),
            cellSize:   gl.getUniformLocation(this._prog, 'u_cellSize'),
            offset:     gl.getUniformLocation(this._prog, 'u_offset'),
            canvasSize: gl.getUniformLocation(this._prog, 'u_canvasSize'),
            algColor:   gl.getUniformLocation(this._prog, 'u_algColor'),
            pathColor:  gl.getUniformLocation(this._prog, 'u_pathColor'),
        };
        gl.uniform1i(this._u.state, 0);

        this._wallBits  = null;
        this._stateData = null;
        this._overlayCanvas = null;
        this._overlayAttached = false;
    }

    _bakeWallBits() {
        const { maze } = this;
        this._wallBits = new Uint8Array(maze.cols * maze.rows);
        for (let r = 0; r < maze.rows; r++) {
            for (let c = 0; c < maze.cols; c++) {
                const { walls } = maze.cells[r][c];
                let b = 0;
                if (walls.N) b |= 1;
                if (walls.S) b |= 2;
                if (walls.E) b |= 4;
                if (walls.W) b |= 8;
                this._wallBits[r * maze.cols + c] = b;
            }
        }
    }

    _allocStateTexture() {
        const gl = this._gl;
        const { cols, rows } = this.maze;
        this._stateData = new Uint8Array(cols * rows * 4);
        gl.bindTexture(gl.TEXTURE_2D, this._stateTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8UI,
            cols, rows, 0, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, this._stateData);
    }

    _drawGL(visitedCells, visitedCount, pathCells, pathCount, algColor, pathColor) {
        const gl = this._gl;
        const { maze, cellSize, ox, oy } = this;

        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0.039, 0.055, 0.078, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (!maze) return;

        const { cols, rows } = maze;
        const data = this._stateData;

        for (let i = 0; i < cols * rows; i++) {
            const r = Math.floor(i / cols), c = i % cols;
            data[i * 4]     = maze.cells[r][c].solid ? 6 : 0;
            data[i * 4 + 1] = 0;
            data[i * 4 + 2] = this._wallBits[i];
            data[i * 4 + 3] = 0;
        }

        if (maze.rooms) {
            for (const { r1, c1, r2, c2 } of maze.rooms)
                for (let r = r1; r <= r2; r++)
                    for (let c = c1; c <= c2; c++)
                        data[(r * cols + c) * 4] = 1;
        }

        for (let i = 0; i < visitedCount; i++) {
            const cell = visitedCells[i];
            const idx  = (cell.row * cols + cell.col) * 4;
            data[idx]     = 2;
            data[idx + 1] = Math.floor(i / Math.max(1, visitedCount - 1) * 255);
        }

        for (let i = 0; i < pathCount; i++) {
            const cell = pathCells[i];
            if (cell === maze.start || cell === maze.exit) continue;
            data[(cell.row * cols + cell.col) * 4] = 3;
        }

        data[(maze.start.row * cols + maze.start.col) * 4] = 4;
        data[(maze.exit.row  * cols + maze.exit.col)  * 4] = 5;

        gl.bindTexture(gl.TEXTURE_2D, this._stateTex);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows,
            gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, data);

        gl.useProgram(this._prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._stateTex);

        const [ar, ag, ab] = _hexRgb(algColor);
        const [pr, pg, pb] = _hexRgb(pathColor);

        gl.uniform2f(this._u.gridSize,   cols, rows);
        gl.uniform1f(this._u.cellSize,   cellSize);
        gl.uniform2f(this._u.offset,     ox, oy);
        gl.uniform2f(this._u.canvasSize, this.canvas.width, this.canvas.height);
        gl.uniform3f(this._u.algColor,   ar/255, ag/255, ab/255);
        gl.uniform3f(this._u.pathColor,  pr/255, pg/255, pb/255);

        gl.bindVertexArray(this._vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);

        if (cellSize >= 13) this._drawLabelsOverlay();
    }

    _drawLabelsOverlay() {
        const { maze, cellSize, ox, oy, canvas } = this;
        if (!this._overlayCanvas) {
            this._overlayCanvas = document.createElement('canvas');
            this._overlayCanvas.style.cssText =
                'position:fixed;top:0;left:0;pointer-events:none;z-index:1';
            this._overlayCtx = this._overlayCanvas.getContext('2d');
        }
        const oc  = this._overlayCanvas;
        const ctx = this._overlayCtx;
        if (oc.width !== canvas.width || oc.height !== canvas.height) {
            oc.width  = canvas.width;
            oc.height = canvas.height;
        }
        ctx.clearRect(0, 0, oc.width, oc.height);

        const fs = Math.max(7, Math.floor(cellSize * 0.48));
        ctx.font = `bold ${fs}px 'Segoe UI', sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = 'rgba(0,0,0,0.55)';
        ctx.fillText('S', ox + maze.start.col * cellSize + cellSize/2, oy + maze.start.row * cellSize + cellSize/2);
        ctx.fillText('E', ox + maze.exit.col  * cellSize + cellSize/2, oy + maze.exit.row  * cellSize + cellSize/2);

        if (!this._overlayAttached && document.body) {
            document.body.appendChild(oc);
            this._overlayAttached = true;
        }
    }

    /* ── Canvas 2D fallback ─────────────────────────────────────────────── */

    _draw2D(visitedCells, visitedCount, pathCells, pathCount, algColor, pathColor) {
        const { canvas, maze, cellSize, ox, oy } = this;
        const ctx = this._ctx;
        if (!maze) return;

        ctx.fillStyle = '#0a0e14';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const visitedIdx = new Map();
        for (let i = 0; i < visitedCount; i++) visitedIdx.set(visitedCells[i], i);
        const pathSet = new Set();
        for (let i = 0; i < pathCount; i++) pathSet.add(pathCells[i]);
        const roomSet = new Set();
        if (maze.rooms) {
            for (const { r1, c1, r2, c2 } of maze.rooms)
                for (let r = r1; r <= r2; r++)
                    for (let c = c1; c <= c2; c++)
                        roomSet.add(maze.cells[r][c]);
        }
        const [cr, cg, cb] = _hexRgb(algColor);

        for (let r = 0; r < maze.rows; r++) {
            for (let c = 0; c < maze.cols; c++) {
                const cell = maze.cells[r][c];
                const x = ox + c * cellSize;
                const y = oy + r * cellSize;
                if      (cell === maze.start)   ctx.fillStyle = '#00d68f';
                else if (cell === maze.exit)    ctx.fillStyle = '#ff4757';
                else if (pathSet.has(cell))     ctx.fillStyle = pathColor;
                else if (visitedIdx.has(cell)) {
                    const t = visitedIdx.get(cell) / Math.max(1, visitedCount - 1);
                    ctx.fillStyle = `rgba(${cr},${cg},${cb},${(0.13 + t * 0.62).toFixed(2)})`;
                } else if (cell.solid)          ctx.fillStyle = '#080a0d';
                else if (roomSet.has(cell))     ctx.fillStyle = '#1e2a1e';
                else                            ctx.fillStyle = '#161b22';
                ctx.fillRect(x + 1, y + 1, cellSize - 1, cellSize - 1);
            }
        }

        if (this._wallCache) ctx.drawImage(this._wallCache, 0, 0);

        if (cellSize >= 13) {
            const fs = Math.max(7, Math.floor(cellSize * 0.48));
            ctx.font = `bold ${fs}px 'Segoe UI', sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillText('S', ox + maze.start.col * cellSize + cellSize/2, oy + maze.start.row * cellSize + cellSize/2);
            ctx.fillText('E', ox + maze.exit.col  * cellSize + cellSize/2, oy + maze.exit.row  * cellSize + cellSize/2);
        }
    }

    _buildWallCache() {
        const { maze, cellSize, ox, oy } = this;
        const off = document.createElement('canvas');
        off.width = this.canvas.width; off.height = this.canvas.height;
        const ctx = off.getContext('2d');
        ctx.strokeStyle = '#2d3748'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let r = 0; r < maze.rows; r++) {
            for (let c = 0; c < maze.cols; c++) {
                const { walls } = maze.cells[r][c];
                const x = ox + c * cellSize, y = oy + r * cellSize;
                if (walls.N) { ctx.moveTo(x, y);            ctx.lineTo(x+cellSize, y);            }
                if (walls.S) { ctx.moveTo(x, y+cellSize);   ctx.lineTo(x+cellSize, y+cellSize);   }
                if (walls.W) { ctx.moveTo(x, y);            ctx.lineTo(x, y+cellSize);            }
                if (walls.E) { ctx.moveTo(x+cellSize, y);   ctx.lineTo(x+cellSize, y+cellSize);   }
            }
        }
        ctx.stroke();
        this._wallCache = off;
    }
}

/* ── Shared WebGL helpers ────────────────────────────────────────────────── */
function _compileProgram(gl, vertSrc, fragSrc) {
    function _shader(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
            throw new Error(gl.getShaderInfoLog(s));
        return s;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, _shader(gl.VERTEX_SHADER,   vertSrc));
    gl.attachShader(prog, _shader(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(prog));
    return prog;
}

function _hexRgb(hex) {
    return [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
    ];
}