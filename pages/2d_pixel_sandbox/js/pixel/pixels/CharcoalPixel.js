import { CombustionHelper } from '../helpers/CombustionHelper.js';
import { MATERIAL, Pixel } from '../Pixel.js';

export class CharcoalPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.CHARCOAL,
      name: 'charcoal',
      color: [42, 39, 34],
      weight: 62,
      swapBuffer: 5,
      displaceable: true,
      flammability: 0.012,
      igniteTemperature: 350,
      burnLifeMin: 150,
      burnLifeMax: 230,
      burnoutChance: 0.0012,
      burnsTo: MATERIAL.ASH,
      burnsToChance: 0.35,
      acceptsDisplacementFrom: new Set([MATERIAL.WATER, MATERIAL.FIRE, MATERIAL.SMOKE, MATERIAL.STEAM, MATERIAL.ASH]),
      mixesWithWaterTo: MATERIAL.MUD,
      rootGrowThrough: true,
    });
  }

  renderColor(tone) {
    const glow = tone % 11;
    return [
      this.color[0] + glow,
      this.color[1] + Math.floor(glow * 0.5),
      this.color[2],
    ];
  }

  update(world, i, x, y, isStatic = false) {
    if (isStatic) {
      this.updateStatic(world, i, x, y);
      return;
    }
    if (world.tryHydrateFromNeighbors(i, x, y)) return;
    if (world.tryIgniteFromNeighbors(i, x, y)) return;

    const dir = Math.random() < 0.5 ? -1 : 1;
    if (world.tryDisplaceInto(i, x, y + 1, 1)) return;
    if (Math.random() < 0.22 && world.tryDisplaceInto(i, x + dir, y + 1, 1)) return;
  }

  updateStatic(world, i, x, y) {
    if (world.hasNeighborWhere(x, y, (pixel) => pixel.extinguishPower > 0)
      || !CombustionHelper.hasOxygenNear(world, x, y)) {
      world.keepActive(i);
      return;
    }

    const hasFlame = world.hasNeighborWhereAcrossLayers(x, y, (pixel) => pixel.burns);
    if (hasFlame) {
      world.heatNeighbors(x, y, 95);
      world.tryIgniteHeatedNeighbors(x, y);
    }
    this.feedFlame(world, x, y, hasFlame ? 0.66 : 0.1, 550);
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
