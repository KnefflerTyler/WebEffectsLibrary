import { PlantGrowthHelper } from '../helpers/PlantGrowthHelper.js';
import { MATERIAL, Pixel } from '../Pixel.js';

export class GrassPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.GRASS,
      name: 'grass',
      color: [78, 154, 63],
      weight: 84,
      swapBuffer: 12,
      displaceable: true,
      acceptsDisplacementFrom: new Set([MATERIAL.WATER, MATERIAL.FIRE, MATERIAL.SMOKE, MATERIAL.STEAM, MATERIAL.ASH]),
      flammability: 0.028,
      burnLifeMin: 28,
      burnLifeMax: 54,
      burnoutChance: 0.012,
      scorchable: true,
      mixesWithWaterTo: MATERIAL.MUD,
      scorchTo: MATERIAL.ASH,
      rootGrowThrough: true,
    });
  }

  renderColor(tone) {
    const wobble = (tone % 19) - 9;
    return [
      this.color[0] + Math.floor(wobble * 0.5),
      this.color[1] + wobble,
      this.color[2] + Math.floor(wobble * 0.6),
    ];
  }

  update(world, i, x, y) {
    if (!PlantGrowthHelper.hasGrowableSurfaceAbove(world, x, y)) {
      world.setCell(i, MATERIAL.DIRT);
      world.touched[i] = world.tick;
      return;
    }

    if (world.tryHydrateFromNeighbors(i, x, y)) return;
    if (world.tryIgniteFromNeighbors(i, x, y)) return;

    const dir = Math.random() < 0.5 ? -1 : 1;
    if (world.tryDisplaceInto(i, x, y + 1, 1)) return;
    if (world.tryDisplaceInto(i, x + dir, y + 1, 1)) return;
    world.tryDisplaceInto(i, x - dir, y + 1, 1);
  }
}
