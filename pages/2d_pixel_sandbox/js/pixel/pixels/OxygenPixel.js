import { GasExpansionHelper } from '../helpers/GasExpansionHelper.js';
import { GasReactionHelper } from '../helpers/GasReactionHelper.js';
import { MATERIAL, Pixel } from '../Pixel.js';

export class OxygenPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.OXYGEN,
      name: 'oxygen',
      color: [18, 25, 34],
      weight: 10,
      gas: true,
      gasSpread: 1,
      oxygen: 1,
      displaceable: true,
      plantGrowThrough: true,
    });
  }

  renderColor(tone) {
    const shimmer = tone % 9;
    return [
      this.color[0] + shimmer,
      this.color[1] + shimmer,
      this.color[2] + shimmer * 2,
    ];
  }

  update(world, i, x, y) {
    if (GasReactionHelper.tryCombineWith(world, i, x, y, MATERIAL.NITROGEN, MATERIAL.AIR)) return;
    GasExpansionHelper.tryMoveIntoSpace(world, i, x, y);
  }
}
