import { MATERIAL, Pixel } from '../Pixel.js';

export class LeafPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.LEAF,
      name: 'leaf',
      color: [65, 150, 78],
      weight: 18,
      flammability: 0.072,
      igniteTemperature: 220,
      fireHeatOutputScale: 0.5,
      scorchable: true,
      scorchTo: MATERIAL.ASH,
      plantGrowThrough: true,
    });
  }

  renderColor(tone) {
    const wobble = (tone % 21) - 10;
    return [
      this.color[0] + Math.floor(wobble * 0.4),
      this.color[1] + wobble,
      this.color[2] + Math.floor(wobble * 0.5),
    ];
  }

  update(world, i, x, y) {
    if (world.tryIgniteFromNeighbors(i, x, y)) return;

    if (world.tryDisplaceInto(i, x, y + 1, 1)) return;
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (Math.random() < 0.35) world.tryDisplaceInto(i, x + dir, y + 1, 1);
  }
}
