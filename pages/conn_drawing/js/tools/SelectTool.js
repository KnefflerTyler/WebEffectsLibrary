import { Tool } from './Tool.js';

/**
 * Drag-to-select a rectangular region.
 * Exposes `selection` ({ x, y, w, h } | null) after the drag completes.
 * Keeps the dashed selection rectangle on the overlay until deactivated.
 */
export class SelectTool extends Tool {
  constructor() {
    super();
    this._start     = null;
    this._selection = null;
  }

  /** @returns {{ x: number, y: number, w: number, h: number } | null} */
  get selection() { return this._selection; }

  onPointerDown({ x, y }) {
    this._start     = { x, y };
    this._selection = null;
    this._clearOverlay();
  }

  onPointerMove({ x, y }) {
    if (!this._start) return;
    const rx = Math.min(this._start.x, x);
    const ry = Math.min(this._start.y, y);
    const rw = Math.abs(x - this._start.x);
    const rh = Math.abs(y - this._start.y);

    const octx = this._octx;
    octx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    octx.fillStyle = 'rgba(74,144,217,0.08)';
    octx.fillRect(rx, ry, rw, rh);
    octx.setLineDash([6, 3]);
    octx.strokeStyle = '#4a90d9';
    octx.lineWidth   = 1.5;
    octx.strokeRect(rx, ry, rw, rh);
    octx.setLineDash([]);
  }

  onPointerUp({ x, y }) {
    if (!this._start) return;
    const rx = Math.min(this._start.x, x);
    const ry = Math.min(this._start.y, y);
    const rw = Math.abs(x - this._start.x);
    const rh = Math.abs(y - this._start.y);
    this._selection = rw > 2 && rh > 2 ? { x: rx, y: ry, w: rw, h: rh } : null;
    this._start     = null;
    // Overlay stays to show the committed selection
  }

  onCancel() {
    this._start     = null;
    this._selection = null;
    this._clearOverlay();
  }

  deactivate() {
    this._start     = null;
    this._selection = null;
    super.deactivate();
  }
}
