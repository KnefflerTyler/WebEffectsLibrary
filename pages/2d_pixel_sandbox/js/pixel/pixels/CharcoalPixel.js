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
      burnLifeMin: 150,
      burnLifeMax: 230,
      burnoutChance: 0.0012,
      burnsTo: MATERIAL.ASH,
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

  update(world, i, x, y) {
    if (world.tryHydrateFromNeighbors(i, x, y)) return;
    if (world.tryIgniteFromNeighbors(i, x, y)) return;

    const dir = Math.random() < 0.5 ? -1 : 1;
    if (world.tryDisplaceInto(i, x, y + 1, 1)) return;
    if (Math.random() < 0.22 && world.tryDisplaceInto(i, x + dir, y + 1, 1)) return;
  }
}
