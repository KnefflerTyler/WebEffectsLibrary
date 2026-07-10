import { MATERIAL } from '../../Pixel.js';

export class SkyObject {
  constructor({ x, y, layer = 'foreground' }) {
    this.x = x;
    this.y = y;
    this.layer = layer;
    this.destroyed = false;
  }

  paintCell(world, x, y, color, intensity = 0) {
    if (!world.inBounds(x, y)) return false;
    return world.setCell(world.index(x, y), MATERIAL.PLASMA, intensity, {
      force: true,
      flags: 0,
      color,
      silent: this.layer === 'backdrop',
    });
  }

  paintEllipse(world, cx, cy, rx, ry, color, intensity = 0, predicate = null) {
    for (let y = Math.max(0, cy - ry); y <= Math.min(world.height - 1, cy + ry); y++) {
      for (let x = Math.max(0, cx - rx); x <= Math.min(world.width - 1, cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy > 1 || (predicate && !predicate(x, y))) continue;
        this.paintCell(world, x, y, color, intensity);
      }
    }
  }

  place(world) {
    world.withLayer(this.layer, () => this.paint(world));
    this.destroyed = true;
  }

  placeBackdrop(world) {
    this.layer = 'backdrop';
    world.withLayer('backdrop', () => this.paint(world, world.tick));
  }

  updateBackdrop(world) {
    world.withLayer('backdrop', () => this.paint(world, world.tick));
  }

  update() {}
}
