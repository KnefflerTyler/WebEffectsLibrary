import { CANVAS_W, CANVAS_H } from './DrawingCanvas.js';

const PALETTE = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#e91e63',
];

const TOOL_ICONS = {
  pen:            '✏️',
  eraser:         '⬜',
  fill:           '🪣',
  line:           '╱',
  rect:           '▭',
  'rect-fill':    '▬',
  ellipse:        '○',
  'ellipse-fill': '●',
  select:         '⬚',
};

/**
 * Renders a real-time cursor for every remote peer on a dedicated overlay canvas.
 * Appended as the top-most child of #canvas-wrapper.
 */
export class CursorOverlay {
  constructor(wrapperEl) {
    this._cursors = new Map();  // peerId → { x, y, tool, color }

    this._canvas        = document.createElement('canvas');
    this._canvas.width  = CANVAS_W;
    this._canvas.height = CANVAS_H;
    Object.assign(this._canvas.style, {
      position:      'absolute',
      inset:         '0',
      width:         '100%',
      height:        '100%',
      pointerEvents: 'none',
      zIndex:        '5',
    });
    wrapperEl.appendChild(this._canvas);
    this._ctx = this._canvas.getContext('2d');
  }

  /** Update or add a remote peer's cursor. */
  update(peerId, x, y, tool) {
    let entry = this._cursors.get(peerId);
    if (!entry) {
      entry = { color: this._colorFor(peerId) };
      this._cursors.set(peerId, entry);
    }
    entry.x    = x;
    entry.y    = y;
    entry.tool = tool;
    this._render();
  }

  /** Remove a peer's cursor (on disconnect). */
  remove(peerId) {
    this._cursors.delete(peerId);
    this._render();
  }

  /** Clear all cursors. */
  clear() {
    this._cursors.clear();
    this._render();
  }

  // ── Private ──────────────────────────────────────────────────────────

  _render() {
    const ctx = this._ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    for (const [id, c] of this._cursors) {
      this._drawCursor(ctx, c.x, c.y, c.color, c.tool, id);
    }
  }

  _drawCursor(ctx, x, y, color, tool, id) {
    // Cursor dot
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle   = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Label: short ID + tool icon
    const icon  = TOOL_ICONS[tool] ?? '';
    const label = `${id.slice(0, 5)}${icon ? ' ' + icon : ''}`;

    ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
    const tw  = ctx.measureText(label).width;
    const lx  = x + 10;
    const ly  = y - 8;
    const pad = 5;

    // Pill background
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(lx - pad, ly - 12, tw + pad * 2, 17, 5);
    ctx.fill();

    // Label text
    ctx.fillStyle = '#fff';
    ctx.fillText(label, lx, ly);
  }

  _colorFor(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return PALETTE[Math.abs(h) % PALETTE.length];
  }
}
