import { MATERIAL, Pixel } from '../Pixel.js';

export class WoodPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.WOOD,
      name: 'wood',
      color: [129, 82, 42],
      weight: 70,
      flammability: 0.018,
      burnLifeMin: 78,
      burnLifeMax: 126,
      burnoutChance: 0.0035,
      burnsTo: MATERIAL.CHARCOAL,
      burnsToChance: 0.82,
      wetTo: MATERIAL.WET_WOOD,
    });
  }

  update(world, i, x, y) {
    if (world.tryHydrateFromNeighbors(i, x, y)) return;
    world.tryIgniteFromNeighbors(i, x, y);
  }
}
