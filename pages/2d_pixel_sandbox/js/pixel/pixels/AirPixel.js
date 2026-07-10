import { GasExpansionHelper } from '../helpers/GasExpansionHelper.js';
import { MATERIAL, Pixel } from '../Pixel.js';

export class AirPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.AIR,
      name: 'air',
      color: [16, 22, 29],
      weight: 10,
      gas: true,
      gasSpread: 1,
      oxygen: 0.28,
      displaceable: true,
      plantGrowThrough: true,
    });
  }

  renderColor(tone) {
    const shimmer = tone % 7;
    return [
      this.color[0] + shimmer,
      this.color[1] + shimmer,
      this.color[2] + shimmer,
    ];
  }

  update(world, i, x, y) {
    if (GasExpansionHelper.tryFillSpace(world, x, y, MATERIAL.AIR, 0.72)) {
      world.keepActive(i);
      return;
    }
    GasExpansionHelper.tryMoveIntoSpace(world, i, x, y);
  }
}
