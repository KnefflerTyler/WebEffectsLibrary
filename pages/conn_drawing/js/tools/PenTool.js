import { Tool } from './Tool.js';

/**
 * Freehand drawing tool. Handles both pen and eraser modes.
 * @param {'pen'|'eraser'} mode
 */
export class PenTool extends Tool {
  constructor(mode = 'pen') {
    super();
    this._mode    = mode;
    this._drawing = false;
    this._lastX   = 0;
    this._lastY   = 0;
  }

  onPointerDown({ x, y }) {
    const { color, size } = this._getOpts();
    this._drawing = true;
    this._lastX   = x;
    this._lastY   = y;
    this._emit({ type: 'stroke_start', x, y, tool: this._mode, color, size });
  }

  onPointerMove({ x, y }) {
    if (!this._drawing) return;
    if (Math.abs(x - this._lastX) < 1 && Math.abs(y - this._lastY) < 1) return;
    this._lastX = x;
    this._lastY = y;
    this._emit({ type: 'stroke_move', x, y });
  }

  onPointerUp(_pos) {
    if (!this._drawing) return;
    this._drawing = false;
    this._emit({ type: 'stroke_end' });
  }

  onCancel() {
    if (this._drawing) {
      this._drawing = false;
      this._emit({ type: 'stroke_end' });
    }
  }

  deactivate() {
    if (this._drawing) {
      this._drawing = false;
      this._emit?.({ type: 'stroke_end' });
    }
    super.deactivate();
  }
}
