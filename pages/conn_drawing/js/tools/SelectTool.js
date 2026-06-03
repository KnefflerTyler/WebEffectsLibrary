import { Tool } from './Tool.js';

/** Half-size of the hit-test zone around each handle (canvas px). */
const HIT  = 8;
/** Half-size of the drawn square handle (canvas px). */
const DRAW = 5;

/**
 * Drag-to-select a rectangular region.
 *
 * Behaviours:
 *  - Drag on empty canvas  → draw new selection
 *  - Drag inside selection  → move selection
 *  - Drag corner handle     → resize both axes
 *  - Drag edge handle       → resize one axis
 *
 * Exposes `selection` ({ x, y, w, h } | null) after an interaction.
 */
export class SelectTool extends Tool {
  constructor() {
    super();
    this._sel  = null;   // committed { x, y, w, h }
    this._drag = null;   // active drag state
  }

  /** @returns {{ x: number, y: number, w: number, h: number } | null} */
  get selection() { return this._sel; }

  // ── Pointer events ─────────────────────────────────────────────────

  onPointerDown({ x, y }) {
    if (this._sel) {
      const handle = this._hitHandle(x, y);
      if (handle) {
        this._drag = { mode: 'resize', handle, startSel: { ...this._sel }, startX: x, startY: y };
        return;
      }
      if (this._hitInside(x, y)) {
        this._drag = { mode: 'move', startSel: { ...this._sel }, startX: x, startY: y };
        return;
      }
    }
    // Start a fresh selection draw
    this._drag = { mode: 'draw', startX: x, startY: y };
    this._sel  = null;
    this._clearOverlay();
  }

  onPointerMove({ x, y }) {
    if (!this._drag) return;
    const d = this._drag;

    if (d.mode === 'draw') {
      this._drawRect(
        Math.min(d.startX, x), Math.min(d.startY, y),
        Math.abs(x - d.startX), Math.abs(y - d.startY),
        false,
      );
    } else if (d.mode === 'move') {
      const dx = x - d.startX, dy = y - d.startY;
      this._sel = { x: d.startSel.x + dx, y: d.startSel.y + dy, w: d.startSel.w, h: d.startSel.h };
      this._drawSelection();
    } else if (d.mode === 'resize') {
      this._sel = this._applyResize(d, x, y);
      this._drawSelection();
    }
  }

  onPointerUp({ x, y }) {
    if (!this._drag) return;
    const d    = this._drag;
    this._drag = null;

    if (d.mode === 'draw') {
      const rw = Math.abs(x - d.startX), rh = Math.abs(y - d.startY);
      this._sel = rw > 2 && rh > 2
        ? { x: Math.min(d.startX, x), y: Math.min(d.startY, y), w: rw, h: rh }
        : null;
    } else if (d.mode === 'resize') {
      const s = this._applyResize(d, x, y);
      this._sel = (s.w > 2 && s.h > 2) ? s : null;
    }
    // move: _sel already updated live

    if (this._sel) this._drawSelection();
    else           this._clearOverlay();
  }

  onCancel() {
    this._drag = null;
    this._sel  = null;
    this._clearOverlay();
  }

  deactivate() {
    this._drag = null;
    this._sel  = null;
    super.deactivate();
  }

  // ── Resize ─────────────────────────────────────────────────────────

  _applyResize(d, x, y) {
    const dx = x - d.startX, dy = y - d.startY;
    const s  = d.startSel;
    let lx = s.x, ly = s.y, rw = s.w, rh = s.h;

    if (d.handle.movesLeft)   { lx += dx; rw -= dx; }
    if (d.handle.movesRight)  { rw += dx; }
    if (d.handle.movesTop)    { ly += dy; rh -= dy; }
    if (d.handle.movesBottom) { rh += dy; }

    // Normalise flipped rectangle
    if (rw < 0) { lx += rw; rw = -rw; }
    if (rh < 0) { ly += rh; rh = -rh; }

    return { x: lx, y: ly, w: rw, h: rh };
  }

  // ── Hit testing ────────────────────────────────────────────────────

  _handles() {
    if (!this._sel) return [];
    const { x, y, w, h } = this._sel;
    const cx = x + w / 2, cy = y + h / 2;
    return [
      { px: x,     py: y,     movesLeft: true,  movesRight: false, movesTop: true,  movesBottom: false },
      { px: cx,    py: y,     movesLeft: false, movesRight: false, movesTop: true,  movesBottom: false },
      { px: x + w, py: y,     movesLeft: false, movesRight: true,  movesTop: true,  movesBottom: false },
      { px: x,     py: cy,    movesLeft: true,  movesRight: false, movesTop: false, movesBottom: false },
      { px: x + w, py: cy,    movesLeft: false, movesRight: true,  movesTop: false, movesBottom: false },
      { px: x,     py: y + h, movesLeft: true,  movesRight: false, movesTop: false, movesBottom: true  },
      { px: cx,    py: y + h, movesLeft: false, movesRight: false, movesTop: false, movesBottom: true  },
      { px: x + w, py: y + h, movesLeft: false, movesRight: true,  movesTop: false, movesBottom: true  },
    ];
  }

  _hitHandle(x, y) {
    return this._handles().find(h => Math.abs(x - h.px) <= HIT && Math.abs(y - h.py) <= HIT) ?? null;
  }

  _hitInside(x, y) {
    const s = this._sel;
    return s && x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
  }

  // ── Drawing ────────────────────────────────────────────────────────

  _drawSelection() {
    if (!this._sel) { this._clearOverlay(); return; }
    const { x, y, w, h } = this._sel;
    this._drawRect(x, y, w, h, true);
  }

  _drawRect(x, y, w, h, withHandles) {
    const octx = this._octx;
    octx.clearRect(0, 0, this._canvas.width, this._canvas.height);

    octx.fillStyle = 'rgba(74,144,217,0.08)';
    octx.fillRect(x, y, w, h);

    octx.setLineDash([6, 3]);
    octx.strokeStyle = '#4a90d9';
    octx.lineWidth   = 1.5;
    octx.strokeRect(x, y, w, h);
    octx.setLineDash([]);

    if (!withHandles) return;

    const cx = x + w / 2, cy = y + h / 2;
    const pts = [
      [x,     y    ], [cx,    y    ], [x + w, y    ],
      [x,     cy   ],                 [x + w, cy   ],
      [x,     y + h], [cx,    y + h], [x + w, y + h],
    ];
    octx.fillStyle   = '#ffffff';
    octx.strokeStyle = '#4a90d9';
    octx.lineWidth   = 1.5;
    for (const [hx, hy] of pts) {
      octx.fillRect  (hx - DRAW, hy - DRAW, DRAW * 2, DRAW * 2);
      octx.strokeRect(hx - DRAW, hy - DRAW, DRAW * 2, DRAW * 2);
    }
  }
}
