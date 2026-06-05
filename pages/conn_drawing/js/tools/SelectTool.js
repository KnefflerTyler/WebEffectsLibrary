import { Tool } from './Tool.js';

/** Hit zone radius around each handle (canvas px). */
const HIT  = 8;
/** Half-side of drawn square handles (canvas px). */
const DRAW = 5;

/**
 * Drag-to-select a rectangular region.
 *
 * Interactions on a committed selection:
 *  - Drag inside   → moves the selected pixels
 *  - Drag handle   → resizes / skews the selected pixels
 *  - Click outside → drops the current selection and starts a new one
 *
 * Pixel manipulation is done via two emitted ops:
 *  - `fill_rect`   – erases the original region (on lift)
 *  - `paste_image` – draws the captured pixels at the new position/size (on commit)
 */
export class SelectTool extends Tool {
  constructor() {
    super();
    this._sel    = null;   // committed { x, y, w, h }
    this._drag   = null;   // active drag state
    this._lifted = null;   // { img: HTMLCanvasElement, origSel } while moving/resizing
  }

  /** @returns {{ x: number, y: number, w: number, h: number } | null} */
  get selection() { return this._sel; }

  // ── Pointer events ──────────────────────────────────────────────────

  onPointerDown({ x, y }) {
    if (this._sel) {
      const handle = this._hitHandle(x, y);
      if (handle) {
        this._lift();
        this._drag = { mode: 'resize', handle, startSel: { ...this._sel }, startX: x, startY: y };
        return;
      }
      if (this._hitInside(x, y)) {
        this._lift();
        this._drag = { mode: 'move', startSel: { ...this._sel }, startX: x, startY: y };
        return;
      }
      // Clicked outside — commit any lifted pixels first
      this._commitLift();
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
      this._drawSelectionWithContent();
    } else if (d.mode === 'resize') {
      this._sel = this._applyResize(d, x, y);
      this._drawSelectionWithContent();
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
      if (this._sel) this._drawSelection();
      else           this._clearOverlay();
    } else if (d.mode === 'resize') {
      const s = this._applyResize(d, x, y);
      this._sel = (s.w > 2 && s.h > 2) ? s : null;
      this._commitLift();
      if (this._sel) this._drawSelection();
      else           this._clearOverlay();
    } else if (d.mode === 'move') {
      // _sel already updated live in onPointerMove
      this._commitLift();
      if (this._sel) this._drawSelection();
      else           this._clearOverlay();
    }
  }

  onCancel() {
    // Restore lifted pixels to their original position
    if (this._lifted) {
      const { origSel, img } = this._lifted;
      this._emit({ type: 'paste_image',
        x: origSel.x, y: origSel.y, w: origSel.w, h: origSel.h,
        dataUrl: img.toDataURL(),
      });
      this._lifted = null;
    }
    this._drag = null;
    this._sel  = null;
    this._clearOverlay();
  }

  deactivate() {
    this._commitLift();
    this._drag = null;
    this._sel  = null;
    super.deactivate();
  }

  // ── Lift / commit ───────────────────────────────────────────────────

  /** Capture the selected canvas region and erase it from the main canvas. */
  _lift() {
    if (!this._sel || this._lifted) return;
    const { x, y, w, h } = this._sel;

    // Snapshot the region
    const tmp = document.createElement('canvas');
    tmp.width  = w;
    tmp.height = h;
    tmp.getContext('2d').drawImage(this._canvas, x, y, w, h, 0, 0, w, h);

    this._lifted = { img: tmp, origSel: { ...this._sel } };

    // Erase from main canvas (local + remote)
    this._emit({ type: 'fill_rect', x, y, w, h });
  }

  /** Draw the lifted image at the current `_sel` position/size onto the main canvas. */
  _commitLift() {
    if (!this._lifted) return;
    if (this._sel && this._sel.w > 2 && this._sel.h > 2) {
      const { x, y, w, h } = this._sel;
      this._emit({ type: 'paste_image',
        x, y, w, h,
        dataUrl: this._lifted.img.toDataURL(),
      });
    }
    this._lifted = null;
  }

  // ── Resize ──────────────────────────────────────────────────────────

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

  // ── Hit testing ─────────────────────────────────────────────────────

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

  // ── Drawing ─────────────────────────────────────────────────────────

  _drawSelection() {
    const octx = this._octx;
    octx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    if (!this._sel) return;
    this._drawOutlineAndHandles(this._sel);
  }

  _drawSelectionWithContent() {
    const octx = this._octx;
    octx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    if (!this._sel) return;
    const { x, y, w, h } = this._sel;

    // Draw the lifted pixels at the new position/size (clearly, no tint over them)
    if (this._lifted) {
      octx.drawImage(this._lifted.img, x, y, w, h);
    }

    this._drawOutlineAndHandles(this._sel);
  }

  /** Draw just the dashed border + handles (no fill tint) so content shows through. */
  _drawOutlineAndHandles({ x, y, w, h }) {
    const octx = this._octx;

    octx.setLineDash([6, 3]);
    octx.strokeStyle = '#4a90d9';
    octx.lineWidth   = 1.5;
    octx.strokeRect(x, y, w, h);
    octx.setLineDash([]);

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

  /** Used only for the live new-selection draw (no handles yet). */
  _drawRect(x, y, w, h) {
    const octx = this._octx;
    octx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    octx.fillStyle = 'rgba(74,144,217,0.08)';
    octx.fillRect(x, y, w, h);
    octx.setLineDash([6, 3]);
    octx.strokeStyle = '#4a90d9';
    octx.lineWidth   = 1.5;
    octx.strokeRect(x, y, w, h);
    octx.setLineDash([]);
  }
}
