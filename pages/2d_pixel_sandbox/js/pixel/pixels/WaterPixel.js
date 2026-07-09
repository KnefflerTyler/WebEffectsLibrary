import { MATERIAL, Pixel } from '../Pixel.js';

export class WaterPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.WATER,
      name: 'water',
      color: [48, 132, 210],
      weight: 35,
      displaceable: true,
      extinguishPower: 1,
      plantMoisture: 22,
      plantConsumesTo: MATERIAL.SPACE,
    });
  }

  renderColor(tone) {
    const wobble = (tone % 23) - 11;
    return [
      this.color[0] + wobble,
      this.color[1] + Math.floor(wobble * 0.6),
      this.color[2] + (tone % 18),
    ];
  }

  update(world, i, x, y) {
    if (world.tryWaterReactWithNeighbor(i, x, y + 1)) return;

    const dir = Math.random() < 0.5 ? -1 : 1;
    if (world.tryDisplaceInto(i, x, y + 1, 1)) return;
    if (world.tryDisplaceInto(i, x + dir, y + 1, 1)) return;
    if (world.tryDisplaceInto(i, x - dir, y + 1, 1)) return;
    if (world.tryWaterReactWithNeighbor(i, x + dir, y)) return;
    if (world.tryWaterReactWithNeighbor(i, x - dir, y)) return;

    const spread = 1 + Math.floor(Math.random() * 4);
    for (let d = 1; d <= spread; d++) {
      if (world.tryDisplaceInto(i, x + dir * d, y, 0)) return;
      if (world.tryDisplaceInto(i, x - dir * d, y, 0)) return;
    }
  }
}
