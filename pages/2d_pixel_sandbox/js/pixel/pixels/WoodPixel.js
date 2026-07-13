import { CombustionHelper } from '../helpers/CombustionHelper.js';
import { MATERIAL, Pixel } from '../Pixel.js';

export class WoodPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.WOOD,
      name: 'wood',
      color: [129, 82, 42],
      usesCustomColor: true,
      weight: 70,
      flammability: 0.018,
      igniteTemperature: 300,
      burnLifeMin: 78,
      burnLifeMax: 126,
      burnDurationScale: 3,
      burnoutChance: 0.0035,
      burnsTo: MATERIAL.CHARCOAL,
      burnsToChance: 0.82,
      wetTo: MATERIAL.WET_WOOD,
    });
  }

  update(world, i, x, y, isStatic = false) {
    if (isStatic) {
      this.updateStatic(world, i, x, y);
      return;
    }
    if (world.tryHydrateFromNeighbors(i, x, y)) return;
    world.tryIgniteFromNeighbors(i, x, y);
  }

  updateStatic(world, i, x, y) {
    if (world.hasNeighborWhere(x, y, (pixel) => pixel.extinguishPower > 0)
      || !CombustionHelper.hasOxygenNear(world, x, y)) {
      world.keepActive(i);
      return;
    }

    const hasFlame = world.hasNeighborWhereAcrossLayers(x, y, (pixel) => pixel.burns);
    if (hasFlame) {
      world.heatNeighbors(x, y, 70);
      world.tryIgniteHeatedNeighbors(x, y);
      this.feedFlame(world, x, y, 0.5, 350);
    }
    world.keepActive(i);
  }

  feedFlame(world, x, y, chance, temperature) {
    for (const [dx, dy] of [[0, -1], [-1, -1], [1, -1], [0, -2], [-1, 0], [1, 0]]) {
      if (Math.random() >= chance) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (!world.inBounds(nx, ny)) continue;

      const target = world.index(nx, ny);
      if (world.cells[target] === MATERIAL.FIRE) {
        world.data[target] = Math.max(world.data[target], this.getBurnLife());
        world.temperature[target] = Math.max(world.temperature[target], temperature);
        world.keepActive(target);
        return;
      }
      if (world.isStatic(target) || !world.getPixelAtIndex(target).displaceable) continue;

      world.setCell(target, MATERIAL.FIRE, this.getBurnLife(), { burnSource: this.id, temperature });
      world.touched[target] = world.tick;
      return;
    }
  }
}
