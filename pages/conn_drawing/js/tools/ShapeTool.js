import { Tool } from './Tool.js';

/**
 * Shared shape renderer used by both ShapeTool (preview + commit)
 * and DrawingCanvas (applying remote ops).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} shape  – 'line' | 'rect' | 'rect-fill' | 'ellipse' | 'ellipse-fill'
 */
export function renderShape(ctx, shape, x1, y1, x2, y2) {
  switch (shape) {
    case 'line':
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      break;
    case 'rect':
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      break;
    case 'rect-fill':
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      break;
    case 'ellipse':
    case 'ellipse-fill': {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.max(Math.abs(x2 - x1) / 2, 0.1);
      const ry = Math.max(Math.abs(y2 - y1) / 2, 0.1);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (shape === 'ellipse-fill') ctx.fill();
      else                          ctx.stroke();
      break;
    }
  }
}

/**
 * Drag-to-draw shape tool.
 * Shows a live preview on the overlay canvas while dragging;
 * commits the op on pointer up.
 *
 * @param {'line'|'rect'|'rect-fill'|'ellipse'|'ellipse-fill'} shapeName
 */
export class ShapeTool extends Tool {
  constructor(shapeName) {
    super();
    this._shapeName = shapeName;
    this._start     = null;
  }

  onPointerDown({ x, y }) {
    this._start = { x, y };
  }

  onPointerMove({ x, y }) {
    if (!this._start) return;
    this._drawPreview(this._start.x, this._start.y, x, y);
  }

  onPointerUp({ x, y }) {
    if (!this._start) return;
    const { color, size } = this._getOpts();
    const op = {
      type: 'shape', shape: this._shapeName,
      x1: this._start.x, y1: this._start.y,
      x2: x, y2: y,
      color, size,
    };
    this._clearOverlay();
    this._start = null;
    this._emit(op);
  }

  onCancel() {
    this._start = null;
    this._clearOverlay();
  }

  deactivate() {
    this._start = null;
    super.deactivate();
  }

  _drawPreview(x1, y1, x2, y2) {
    const octx = this._octx;
    octx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    const { color, size } = this._getOpts();
    octx.globalAlpha = 0.8;
    octx.strokeStyle = color;
    octx.fillStyle   = color;
    octx.lineWidth   = size;
    octx.lineCap     = 'round';
    octx.lineJoin    = 'round';
    renderShape(octx, this._shapeName, x1, y1, x2, y2);
    octx.globalAlpha = 1;
  }
}
