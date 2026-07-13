import { MATERIAL, Pixel } from '../Pixel.js';

export class FlowerPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.FLOWER,
      name: 'flower',
      color: [232, 104, 178],
      weight: 16,
      flammability: 0.06,
      igniteTemperature: 210,
      burnLifeMin: 18,
      burnLifeMax: 34,
      fireHeatOutputScale: 0.5,
      fireHeatAbsorption: 0.9,
      burnsTo: MATERIAL.ASH,
      burnsToChance: 0.18,
      plantGrowThrough: true,
      scorchable: true,
      scorchTo: MATERIAL.ASH,
    });
  }

  renderColor(tone) {
    const petal = tone % 3;
    if (petal === 0) return [246, 212, 86];
    if (petal === 1) return [232, 104, 178];
    return [184, 91, 218];
  }

  update(world, i, x, y) {
    world.tryIgniteFromNeighbors(i, x, y);
  }
}
