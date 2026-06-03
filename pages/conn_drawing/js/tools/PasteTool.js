import { Tool } from './Tool.js';

/**
 * Paste-mode tool. Displays an image preview that follows the cursor;
 * clicking commits it to the canvas at that position.
 *
 * Instantiated programmatically (not via toolbar click).
 * Calls `onDone()` after a commit or cancel so DrawingCanvas can restore
 * the previously active tool.
 *
 * @param {string}   dataUrl   – image data URL
 * @param {number}   imgW      – natural image width
 * @param {number}   imgH      – natural image height
 * @param {Function} onDone    – called on commit or cancel
 */
export class PasteTool extends Tool {
  constructor(dataUrl, imgW, imgH, onDone) {
    super();
    this._dataUrl = dataUrl;
    this._imgW    = imgW;
    this._imgH    = imgH;
    this._onDone  = onDone;
    this._img     = null;
    this._pos     = { x: 0, y: 0 };
  }

  activate(context) {
    super.activate(context);
    const W = this._canvas.width;
    const H = this._canvas.height;
    this._pos = { x: W / 2 - this._imgW / 2, y: H / 2 - this._imgH / 2 };

    const img  = new Image();
    img.onload = () => {
      this._img = img;
      this._drawPreview();
    };
    img.src = this._dataUrl;
  }

  onPointerMove({ x, y }) {
    this._pos = { x: x - this._imgW / 2, y: y - this._imgH / 2 };
    this._drawPreview();
  }

  onPointerDown({ x, y }) {
    if (!this._img) return;
    const px = x - this._imgW / 2;
    const py = y - this._imgH / 2;
    this._emit({
      type:    'paste_image',
      x: px, y: py,
      w: this._imgW,
      h: this._imgH,
      dataUrl: this._dataUrl,
    });
    this._clearOverlay();
    this._onDone();
  }

  onCancel() {
    this._clearOverlay();
    this._onDone();
  }

  deactivate() {
    // Intentionally no clearOverlay — DrawingCanvas handles it on restore
  }

  _drawPreview() {
    const octx = this._octx;
    if (!octx || !this._img) return;
    octx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    octx.globalAlpha = 0.85;
    octx.drawImage(this._img, this._pos.x, this._pos.y, this._imgW, this._imgH);
    octx.globalAlpha = 1;
    octx.setLineDash([6, 3]);
    octx.strokeStyle = '#4a90d9';
    octx.lineWidth   = 1.5;
    octx.strokeRect(this._pos.x, this._pos.y, this._imgW, this._imgH);
    octx.setLineDash([]);
  }
}
