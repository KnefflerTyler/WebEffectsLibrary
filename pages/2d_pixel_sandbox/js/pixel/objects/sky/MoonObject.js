import { SkyObject } from './SkyObject.js';

export class MoonObject extends SkyObject {
  constructor({ x, y, radius = 13, crescent = 0.35, layer }) {
    super({ x, y, layer });
    this.radius = radius;
    this.crescent = crescent;
  }

  paint(world, tick = 0) {
    const cutoff = this.x + this.radius * this.crescent;
    const glow = 88 + Math.round((Math.sin(tick * 0.025) + 1) * 7);
    this.paintEllipse(world, this.x, this.y, this.radius, this.radius, [202, 220, 240], glow, (x) => x <= cutoff);
  }
}
