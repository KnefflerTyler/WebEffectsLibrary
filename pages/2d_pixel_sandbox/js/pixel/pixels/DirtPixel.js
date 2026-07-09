import { MATERIAL, Pixel } from '../Pixel.js';

export class DirtPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.DIRT,
      name: 'dirt',
      color: [137, 103, 58],
      weight: 85,
      swapBuffer: 12,
      displaceable: true,
      acceptsDisplacementFrom: new Set([MATERIAL.WATER, MATERIAL.FIRE, MATERIAL.SMOKE, MATERIAL.STEAM, MATERIAL.ASH]),
      scorchable: true,
      mixesWithWaterTo: MATERIAL.MUD,
      scorchTo: MATERIAL.ASH,
      rootGrowThrough: true,
    });
  }

  update(world, i, x, y) {
    if (world.tryHydrateFromNeighbors(i, x, y)) return;

    const dir = Math.random() < 0.5 ? -1 : 1;
    if (world.tryDisplaceInto(i, x, y + 1, 1)) return;
    if (world.tryDisplaceInto(i, x + dir, y + 1, 1)) return;
    if (world.tryDisplaceInto(i, x - dir, y + 1, 1)) return;
  }
}
