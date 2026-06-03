/**
 * Abstract base class for all drawing tools.
 *
 * Subclasses implement pointer lifecycle methods and call `this._emit(op)`
 * to both apply an operation locally and broadcast it over the network.
 * DrawingCanvas activates/deactivates tools and forwards pointer events.
 */
export class Tool {
  /**
   * @param {{
   *   canvas:  HTMLCanvasElement,
   *   ctx:     CanvasRenderingContext2D,
   *   overlay: HTMLCanvasElement,
   *   octx:    CanvasRenderingContext2D,
   *   emit:    (op: object) => void,
   *   getOpts: () => { color: string, size: number },
   * }} context
   */
  activate(context) {
    this._canvas  = context.canvas;
    this._ctx     = context.ctx;
    this._overlay = context.overlay;
    this._octx    = context.octx;
    this._emit    = context.emit;
    this._getOpts = context.getOpts;
  }

  /** Called when switching away from this tool. Clears the overlay by default. */
  deactivate() {
    this._clearOverlay();
  }

  onPointerDown(_pos) {}
  onPointerMove(_pos) {}
  onPointerUp(_pos)   {}

  /** Called on pointercancel or Escape key. */
  onCancel() {
    this.deactivate();
  }

  _clearOverlay() {
    this._octx?.clearRect(0, 0, this._canvas.width, this._canvas.height);
  }
}
