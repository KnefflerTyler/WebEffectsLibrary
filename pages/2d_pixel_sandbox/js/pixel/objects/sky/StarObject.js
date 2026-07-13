import { SkyObject } from './SkyObject.js';
import { MATERIAL } from '../../Pixel.js';

const STAR_COLOR = [255, 247, 210];

export class StarObject extends SkyObject {
  constructor({ x, y, radius = 1, layer }) {
    super({ x, y, layer });
    this.radius = radius;
  }

  paint(world, tick = 0) {
    const wave = (Math.sin(tick * 0.16 + this.x * 0.31 + this.y * 0.17) + 1) * 0.5;
    const sparkle = wave * wave * wave;
    const brightness = 0.22 + sparkle * 0.78;
    const color = STAR_COLOR.map((channel) => Math.round(channel * brightness));
    const intensity = Math.round(48 + sparkle * 207);
    this.paintCell(world, this.x, this.y, color, intensity, MATERIAL.STAR);
    if (this.radius < 2) return;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const rayColor = color.map((channel) => Math.round(channel * 0.72));
      this.paintCell(world, this.x + dx, this.y + dy, rayColor, intensity, MATERIAL.STAR);
    }
  }
}
