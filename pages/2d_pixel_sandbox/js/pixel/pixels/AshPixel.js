import { MATERIAL, Pixel } from '../Pixel.js';

export class AshPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.ASH,
      name: 'ash',
      color: [86, 83, 76],
      weight: 28,
      swapBuffer: 3,
      displaceable: true,
      mixesWithWaterTo: MATERIAL.MUD,
      rootGrowThrough: true,
    });
  }

  update(world, i, x, y) {
    if (world.tryHydrateFromNeighbors(i, x, y)) return;

    const dir = Math.random() < 0.5 ? -1 : 1;
    if (world.tryDisplaceInto(i, x, y + 1, 1)) return;
    if (Math.random() < 0.35 && world.tryDisplaceInto(i, x + dir, y + 1, 1)) return;
    if (Math.random() < 0.2) world.tryDisplaceInto(i, x + dir, y, 0);
  }
}
