import { MATERIAL, Pixel } from '../Pixel.js';

export class WetWoodPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.WET_WOOD,
      name: 'wetWood',
      color: [89, 72, 52],
      weight: 82,
      flammability: 0.004,
      igniteTemperature: 450,
      burnLifeMin: 64,
      burnLifeMax: 104,
      burnDurationScale: 3,
      burnoutChance: 0.0025,
      fireHeatOutputScale: 0.35,
      fireHeatAbsorption: 0.25,
      burnsTo: MATERIAL.CHARCOAL,
      burnsToChance: 0.55,
    });
  }

  getInitialData(value = 0) {
    return value || 150 + Math.floor(Math.random() * 90);
  }

  renderColor(tone, moisture) {
    const wobble = (tone % 17) - 8;
    const wet = Math.max(0, Math.min(1, moisture / 240));
    return [
      72 + Math.floor(28 * (1 - wet)) + wobble,
      63 + Math.floor(20 * (1 - wet)) + wobble,
      54 + Math.floor(10 * wet) + wobble,
    ];
  }

  update(world, i, x, y, isStatic = false) {
    if (world.hasNeighborWhere(x, y, (pixel) => pixel.burns)) {
      world.data[i] = Math.max(0, world.data[i] - 5);
      world.emitIntoNeighbor(x, y, MATERIAL.STEAM, 18, 0.25);
    } else if (Math.random() < 0.018) {
      world.data[i] = Math.max(0, world.data[i] - 1);
    }

    if (world.data[i] <= 0) {
      world.setCell(i, MATERIAL.WOOD);
      world.touched[i] = world.tick;
      return;
    }

    if (world.tryIgniteFromNeighbors(i, x, y)) return;

    if (!isStatic && world.tryDisplaceInto(i, x, y + 1, 1)) return;
    if (!isStatic) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      if (Math.random() < 0.08 && world.tryDisplaceInto(i, x + dir, y + 1, 1)) return;
    }
    world.keepActive(i);
  }
}
