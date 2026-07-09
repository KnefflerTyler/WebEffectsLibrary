import { MATERIAL, Pixel } from '../Pixel.js';

export class WoodPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.WOOD,
      name: 'wood',
      color: [129, 82, 42],
      weight: 70,
      flammability: 0.035,
      wetTo: MATERIAL.WET_WOOD,
    });
  }

  update(world, i, x, y) {
    if (world.tryHydrateFromNeighbors(i, x, y)) return;
    world.tryIgniteFromNeighbors(i, x, y);
  }
}
