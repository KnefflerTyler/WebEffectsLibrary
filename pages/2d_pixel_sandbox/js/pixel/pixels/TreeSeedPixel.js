import { PlantGrowthHelper } from '../helpers/PlantGrowthHelper.js';
import { MATERIAL, Pixel } from '../Pixel.js';

export class TreeSeedPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.SEED,
      name: 'seed',
      color: [191, 145, 68],
      weight: 62,
      displaceable: true,
      flammability: 0.045,
      igniteTemperature: 260,
      scorchable: true,
      scorchTo: MATERIAL.ASH,
    });
  }

  getInitialData(value = 0) {
    return value || 16;
  }

  renderColor(tone, growth) {
    const sprout = Math.min(1, growth / 96);
    const wobble = (tone % 13) - 6;
    return [
      165 + Math.floor(34 * (1 - sprout)) + wobble,
      108 + Math.floor(58 * sprout) + wobble,
      48 + Math.floor(18 * sprout),
    ];
  }

  update(world, i, x, y) {
    if (world.isStatic(i)) return;
    if (world.tryIgniteFromNeighbors(i, x, y)) return;

    if (!world.hasNoGravity(i)) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      if (world.tryDisplaceInto(i, x, y + 1, 1)) return;
      if (world.tryDisplaceInto(i, x + dir, y + 1, 1)) return;
      if (world.tryDisplaceInto(i, x - dir, y + 1, 1)) return;
    }

    if ((world.tick + i) % 4 !== 0) {
      world.keepActive(i);
      return;
    }

    const rootRadius = Math.min(30, 10 + Math.floor(world.data[i] / 10));
    const moisture = PlantGrowthHelper.consumeMoistureNearPlant(world, x, y, rootRadius);
    if (moisture > 0) {
      world.data[i] = Math.min(255, world.data[i] + moisture);
    } else {
      world.data[i] = Math.max(0, world.data[i] - 1);
    }

    if (
      world.data[i] >= 4
      && (world.tick + i) % 8 === 0
      && PlantGrowthHelper.tryGrowRootNetwork(world, x, y, world.data[i])
    ) {
      world.touched[i] = world.tick;
      world.keepActive(i);
      return;
    }

    if (world.data[i] >= 18 && PlantGrowthHelper.tryGrowTree(world, x, y, world.data[i])) {
      world.touched[i] = world.tick;
      world.keepActive(i);
      return;
    }

    if (world.data[i] >= 250 && Math.random() < 0.015) {
      world.setCell(i, MATERIAL.WOOD);
      return;
    }

    world.keepActive(i);
  }
}
