import { MATERIAL, Pixel } from '../Pixel.js';

export class RootPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.ROOT,
      name: 'root',
      color: [116, 82, 48],
      flammability: 0.018,
      igniteTemperature: 300,
      scorchable: true,
      scorchTo: MATERIAL.ASH,
      rootGrowThrough: true,
    });
  }

  renderColor(tone) {
    const wobble = (tone % 17) - 8;
    return [
      this.color[0] + wobble,
      this.color[1] + Math.floor(wobble * 0.7),
      this.color[2] + Math.floor(wobble * 0.4),
    ];
  }

  update(world, i, x, y) {
    world.tryIgniteFromNeighbors(i, x, y);
  }
}
