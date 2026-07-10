import { SkyObject } from './SkyObject.js';

const STAR_COLOR = [226, 239, 255];

export class StarObject extends SkyObject {
  constructor({ x, y, radius = 1, layer }) {
    super({ x, y, layer });
    this.radius = radius;
  }

  paint(world, tick = 0) {
    const twinkle = Math.round((Math.sin(tick * 0.12 + this.x * 0.31 + this.y * 0.17) + 1) * 18);
    this.paintCell(world, this.x, this.y, STAR_COLOR, 82 + twinkle);
    if (this.radius < 2) return;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      this.paintCell(world, this.x + dx, this.y + dy, STAR_COLOR, 72 + twinkle);
    }
  }
}
