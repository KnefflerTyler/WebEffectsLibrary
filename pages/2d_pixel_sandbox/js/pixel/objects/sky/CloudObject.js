import { SkyObject } from './SkyObject.js';

const CLOUD_COLOR = [205, 225, 238];

export class CloudObject extends SkyObject {
  constructor({ x, y, width = 80, height = 18, layer }) {
    super({ x, y, layer });
    this.width = width;
    this.height = height;
  }

  paint(world, tick = 0) {
    const rx = Math.max(3, Math.round(this.width / 2));
    const ry = Math.max(2, Math.round(this.height / 2));
    const shimmer = Math.round((Math.sin(tick * 0.018 + this.x * 0.01) + 1) * 5);
    this.paintEllipse(world, this.x, this.y, rx, ry, CLOUD_COLOR, 84 + shimmer);
    this.paintEllipse(world, this.x - Math.round(rx * 0.35), this.y - Math.round(ry * 0.45), Math.round(rx * 0.45), Math.round(ry * 0.8), CLOUD_COLOR, 88 + shimmer);
    this.paintEllipse(world, this.x + Math.round(rx * 0.25), this.y - Math.round(ry * 0.65), Math.round(rx * 0.38), ry, CLOUD_COLOR, 92 + shimmer);
  }
}
