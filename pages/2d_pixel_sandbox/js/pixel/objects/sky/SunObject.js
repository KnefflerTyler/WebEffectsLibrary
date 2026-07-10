import { SkyObject } from './SkyObject.js';

export class SunObject extends SkyObject {
  constructor({ x, y, radius = 14, layer }) {
    super({ x, y, layer });
    this.radius = radius;
  }

  paint(world, tick = 0) {
    const pulse = 96 + Math.round((Math.sin(tick * 0.035) + 1) * 8);
    this.paintEllipse(world, this.x, this.y, this.radius, this.radius, [255, 190, 48], pulse);
  }
}
