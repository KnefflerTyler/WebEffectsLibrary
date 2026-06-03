import { Tool } from './Tool.js';

/** Single-click flood fill. */
export class FillTool extends Tool {
  onPointerDown({ x, y }) {
    const { color } = this._getOpts();
    this._emit({ type: 'fill', x, y, color });
  }
}
