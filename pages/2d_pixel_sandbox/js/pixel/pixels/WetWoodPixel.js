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
      burnoutChance: 0.0025,
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

  update(world, i, x, y) {
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

    world.tryIgniteFromNeighbors(i, x, y);
    world.keepActive(i);
  }
}
