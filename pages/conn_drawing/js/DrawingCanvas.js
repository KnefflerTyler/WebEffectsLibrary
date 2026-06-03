import { PenTool    } from './tools/PenTool.js';
import { FillTool   } from './tools/FillTool.js';
import { ShapeTool, renderShape } from './tools/ShapeTool.js';
import { SelectTool } from './tools/SelectTool.js';
import { PasteTool  } from './tools/PasteTool.js';

export const CANVAS_W = 1200;
export const CANVAS_H = 750;

/**
 * Owns the <canvas> element, the overlay canvas, and the active Tool instance.
 *
 * Responsibilities:
 *  - Initialise and resize canvas / overlay.
 *  - Maintain the tool registry and delegate pointer events to the active tool.
 *  - Apply ops that arrive from the network (applyOp).
 *  - Manage the clipboard and enter paste mode.
 *
 * @param {HTMLCanvasElement} canvasEl
 * @param {{ onOp: (msg: object) => void }} opts
 */
export class DrawingCanvas {
  constructor(canvasEl, { onOp }) {
    this._canvas = canvasEl;
    this._ctx    = canvasEl.getContext('2d');
    this._onOp   = onOp;

    this._canvas.width  = CANVAS_W;
    this._canvas.height = CANVAS_H;

    this._color         = '#e74c3c';
    this._size          = 6;
    this._clipboard     = null;   // { dataUrl, w, h }
    this._prevToolName  = 'pen';  // restored after paste mode exits

    this._tools      = this._buildToolRegistry();
    this._activeTool = null;

    this._clear();
    this._initOverlay();
    this._setActiveTool('pen');
    this._bindPointerEvents();
    this._bindSystemPaste();
  }

  // ── Public API ──────────────────────────────────────────────────────

  setTool(name) {
    this._prevToolName = name;
    this._activeTool?.deactivate();
    this._setActiveTool(name);
  }

  setColor(hex) { this._color = hex; }
  setSize(px)   { this._size  = px;  }

  getDataUrl() { return this._canvas.toDataURL(); }

  /**
   * Copy the current SelectTool selection to the internal clipboard.
   * @returns {boolean} true on success
   */
  copySelection() {
    const sel = this._tools.select.selection;
    if (!sel || sel.w < 2 || sel.h < 2) return false;

    const tmp = document.createElement('canvas');
    tmp.width  = sel.w;
    tmp.height = sel.h;
    tmp.getContext('2d').drawImage(this._canvas, sel.x, sel.y, sel.w, sel.h, 0, 0, sel.w, sel.h);
    this._clipboard = { dataUrl: tmp.toDataURL(), w: sel.w, h: sel.h };
    return true;
  }

  /** Enter paste mode with the internal clipboard. */
  pasteClipboard() {
    if (!this._clipboard) return;
    this._enterPasteMode(this._clipboard.dataUrl, this._clipboard.w, this._clipboard.h);
  }

  get hasClipboard() { return !!this._clipboard; }

  /**
   * Apply an op from the network (or from a local tool via _emit).
   * This is the single write path for all canvas mutations.
   */
  applyOp(msg) {
    const ctx = this._ctx;
    switch (msg.type) {
      case 'stroke_start': {
        ctx.globalCompositeOperation = msg.tool === 'eraser' ? 'destination-out' : 'source-over';
        ctx.strokeStyle = msg.tool === 'eraser' ? 'rgba(0,0,0,1)' : msg.color;
        ctx.lineWidth   = msg.size;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.beginPath();
        ctx.moveTo(msg.x, msg.y);
        break;
      }
      case 'stroke_move': {
        ctx.lineTo(msg.x, msg.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(msg.x, msg.y);
        break;
      }
      case 'stroke_end': {
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'fill': {
        this._floodFill(Math.round(msg.x), Math.round(msg.y), msg.color);
        break;
      }
      case 'shape': {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = msg.color;
        ctx.fillStyle   = msg.color;
        ctx.lineWidth   = msg.size;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        renderShape(ctx, msg.shape, msg.x1, msg.y1, msg.x2, msg.y2);
        break;
      }
      case 'paste_image': {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, msg.x, msg.y, msg.w, msg.h);
        img.src    = msg.dataUrl;
        break;
      }
      case 'clear': {
        this._clear();
        break;
      }
      case 'canvas_sync': {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
          ctx.drawImage(img, 0, 0);
        };
        img.src = msg.dataUrl;
        break;
      }
    }
  }

  // ── Tool registry ───────────────────────────────────────────────────

  _buildToolRegistry() {
    return {
      pen:            new PenTool('pen'),
      eraser:         new PenTool('eraser'),
      fill:           new FillTool(),
      line:           new ShapeTool('line'),
      rect:           new ShapeTool('rect'),
      'rect-fill':    new ShapeTool('rect-fill'),
      ellipse:        new ShapeTool('ellipse'),
      'ellipse-fill': new ShapeTool('ellipse-fill'),
      select:         new SelectTool(),
    };
  }

  /** Returns the shared activation context passed to every tool. */
  _toolContext() {
    return {
      canvas:  this._canvas,
      ctx:     this._ctx,
      overlay: this._overlay,
      octx:    this._octx,
      emit: op => {
        this.applyOp(op);
        this._onOp(op);
      },
      getOpts: () => ({ color: this._color, size: this._size }),
    };
  }

  _setActiveTool(name) {
    this._activeTool = this._tools[name] ?? this._tools.pen;
    this._activeTool.activate(this._toolContext());
  }

  // ── Overlay ─────────────────────────────────────────────────────────

  _initOverlay() {
    this._overlay        = document.createElement('canvas');
    this._overlay.width  = CANVAS_W;
    this._overlay.height = CANVAS_H;
    Object.assign(this._overlay.style, {
      position:      'absolute',
      inset:         '0',
      width:         '100%',
      height:        '100%',
      pointerEvents: 'none',
    });
    this._canvas.parentElement.appendChild(this._overlay);
    this._octx = this._overlay.getContext('2d');
  }

  // ── Paste mode ───────────────────────────────────────────────────────

  _enterPasteMode(dataUrl, w, h) {
    this._activeTool?.deactivate();
    const paste = new PasteTool(dataUrl, w, h, () => {
      this._octx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      this._setActiveTool(this._prevToolName);
      delete document.getElementById('app').dataset.pasteMode;
    });
    this._activeTool = paste;
    paste.activate(this._toolContext());
    document.getElementById('app').dataset.pasteMode = '1';
  }

  _bindSystemPaste() {
    document.addEventListener('paste', e => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob   = item.getAsFile();
          const reader = new FileReader();
          reader.onload = evt => {
            const dataUrl = evt.target.result;
            const img     = new Image();
            img.onload    = () => this._enterPasteMode(dataUrl, img.naturalWidth, img.naturalHeight);
            img.src       = dataUrl;
          };
          reader.readAsDataURL(blob);
          e.preventDefault();
          break;
        }
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') this._activeTool?.onCancel();
    });
  }

  // ── Pointer events ───────────────────────────────────────────────────

  _bindPointerEvents() {
    const el = this._canvas;

    el.addEventListener('pointerdown', e => {
      if (e.button !== undefined && e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      this._activeTool?.onPointerDown(this._getPos(e));
    });

    el.addEventListener('pointermove', e => {
      this._activeTool?.onPointerMove(this._getPos(e));
    });

    el.addEventListener('pointerup', e => {
      this._activeTool?.onPointerUp(this._getPos(e));
    });

    el.addEventListener('pointercancel', () => {
      this._activeTool?.onCancel();
    });

    el.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    el.addEventListener('touchmove',  e => e.preventDefault(), { passive: false });
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  _getPos(e) {
    const rect   = this._canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const src    = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top)  * scaleY,
    };
  }

  _clear() {
    const ctx = this._ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  // ── Flood fill ───────────────────────────────────────────────────────

  _hexToRgba(hex) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
      255,
    ];
  }

  _colorsMatch(data, idx, target, tolerance = 20) {
    return (
      Math.abs(data[idx]     - target[0]) <= tolerance &&
      Math.abs(data[idx + 1] - target[1]) <= tolerance &&
      Math.abs(data[idx + 2] - target[2]) <= tolerance &&
      Math.abs(data[idx + 3] - target[3]) <= tolerance
    );
  }

  _floodFill(startX, startY, fillHex) {
    const ctx       = this._ctx;
    const imageData = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
    const data      = imageData.data;
    const startIdx  = (startY * CANVAS_W + startX) * 4;

    const targetColor = [data[startIdx], data[startIdx + 1], data[startIdx + 2], data[startIdx + 3]];
    const fillColor   = this._hexToRgba(fillHex);

    if (this._colorsMatch(data, startIdx, fillColor, 0)) return;

    const stack   = [[startX, startY]];
    const visited = new Uint8Array(CANVAS_W * CANVAS_H);

    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || x >= CANVAS_W || y < 0 || y >= CANVAS_H) continue;
      const idx  = (y * CANVAS_W + x) * 4;
      const vidx = y * CANVAS_W + x;
      if (visited[vidx]) continue;
      if (!this._colorsMatch(data, idx, targetColor)) continue;

      visited[vidx]     = 1;
      data[idx]         = fillColor[0];
      data[idx + 1]     = fillColor[1];
      data[idx + 2]     = fillColor[2];
      data[idx + 3]     = fillColor[3];

      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }

    ctx.putImageData(imageData, 0, 0);
  }
}
