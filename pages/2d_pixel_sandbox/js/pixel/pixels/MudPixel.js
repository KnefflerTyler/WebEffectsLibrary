import { MATERIAL, Pixel } from '../Pixel.js';

export class MudPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.MUD,
      name: 'mud',
      color: [91, 76, 52],
      weight: 96,
      swapBuffer: 14,
      displaceable: true,
      acceptsDisplacementFrom: new Set([MATERIAL.WATER, MATERIAL.FIRE, MATERIAL.SMOKE, MATERIAL.STEAM]),
      scorchable: true,
      mixesWithWaterTo: MATERIAL.MUD,
      scorchTo: MATERIAL.DIRT,
      plantMoisture: 10,
      plantMoistureDrain: 28,
      plantConsumesTo: MATERIAL.DIRT,
      rootGrowThrough: true,
    });
  }

  getInitialData(value = 0) {
    return value || 180 + Math.floor(Math.random() * 80);
  }

  update(world, i, x, y) {
    if (world.hasNeighborWhere(x, y, (pixel) => pixel.burns)) {
      world.data[i] = Math.max(0, world.data[i] - 4);
      world.emitIntoNeighbor(x, y, MATERIAL.STEAM, 14, 0.18);
    } else if (Math.random() < 0.006) {
      world.data[i] = Math.max(0, world.data[i] - 1);
    }

    if (world.data[i] <= 0) {
      world.setCell(i, MATERIAL.DIRT);
      world.touched[i] = world.tick;
      return;
    }

    if (Math.random() > 0.55) {
      world.keepActive(i);
      return;
    }
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (world.tryDisplaceInto(i, x, y + 1, 1)) return;
    if (world.tryDisplaceInto(i, x + dir, y + 1, 1)) return;
    world.tryDisplaceInto(i, x - dir, y + 1, 1);
    world.keepActive(i);
  }
}
