import { GasExpansionHelper } from '../helpers/GasExpansionHelper.js';
import { GasReactionHelper } from '../helpers/GasReactionHelper.js';
import { MATERIAL, Pixel } from '../Pixel.js';

export class NitrogenPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.NITROGEN,
      name: 'nitrogen',
      color: [17, 22, 39],
      weight: 10,
      gas: true,
      gasSpread: 1,
      displaceable: true,
      plantGrowThrough: true,
    });
  }

  renderColor(tone) {
    const shimmer = tone % 8;
    return [
      this.color[0] + shimmer,
      this.color[1] + shimmer,
      this.color[2] + shimmer * 2,
    ];
  }

  update(world, i, x, y) {
    if (GasReactionHelper.tryCombineWith(world, i, x, y, MATERIAL.OXYGEN, MATERIAL.AIR)) return;
    GasExpansionHelper.tryMoveIntoSpace(world, i, x, y);
  }
}
