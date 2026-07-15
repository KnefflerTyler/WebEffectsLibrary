import { MATERIAL, Pixel } from '../Pixel.js';

export class ClothPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.CLOTH,
      name: 'cloth',
      color: [188, 54, 56],
      usesCustomColor: true,
      weight: 32,
      flammability: 0.045,
      igniteTemperature: 230,
      burnLifeMin: 42,
      burnLifeMax: 76,
      burnoutChance: 0.009,
      fireHeatOutputScale: 0.65,
      fireHeatAbsorption: 0.75,
      burnsTo: MATERIAL.ASH,
      burnsToChance: 0.25,
      scorchable: true,
      scorchTo: MATERIAL.ASH,
    });
  }

  renderColor(tone, value, tint = this.color) {
    const weave = (tone % 17) - 8;
    const stripe = value % 3 === 0 ? 10 : 0;
    return [
      tint[0] + weave + stripe,
      tint[1] + Math.floor(weave * 0.55) + stripe,
      tint[2] + Math.floor(weave * 0.45) + stripe,
    ];
  }

  update(world, i, x, y) {
    if (world.tryIgniteFromNeighbors(i, x, y)) return;

    if (world.tryDisplaceInto(i, x, y + 1, 1)) return;
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (Math.random() < 0.08) world.tryDisplaceInto(i, x + dir, y + 1, 1);
  }
}
