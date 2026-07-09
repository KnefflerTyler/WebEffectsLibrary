import { GasExpansionHelper } from '../helpers/GasExpansionHelper.js';
import { MATERIAL, Pixel } from '../Pixel.js';

export class SteamPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.STEAM,
      name: 'steam',
      color: [178, 210, 220],
      weight: 10,
      buoyancy: 8,
      gas: true,
      gasSpread: 1,
      displaceable: true,
      plantGrowThrough: true,
    });
  }

  getInitialData(value = 0) {
    return value || 22 + Math.floor(Math.random() * 28);
  }

  renderColor(tone, life) {
    const fade = Math.max(0, Math.min(1, life / 50));
    const shimmer = tone % 14;
    const value = 130 + Math.floor(78 * fade) + shimmer;
    return [value, Math.min(235, value + 14), Math.min(245, value + 20)];
  }

  update(world, i, x, y) {
    world.data[i] = Math.max(0, world.data[i] - 1);
    if (world.data[i] <= 0 || Math.random() < 0.006) {
      world.setCell(i, MATERIAL.WATER);
      world.touched[i] = world.tick;
      return;
    }

    const dir = Math.random() < 0.5 ? -1 : 1;
    if (GasExpansionHelper.tryMoveIntoSpace(world, i, x, y, { upwardBias: 3 })) return;
    if (world.tryDisplaceInto(i, x, y - 1, -1)) return;
    if (Math.random() < 0.58 && world.tryDisplaceInto(i, x + dir, y - 1, -1)) return;
    if (Math.random() < 0.34) world.tryDisplaceInto(i, x + dir, y, -1);
    world.keepActive(i);
  }
}
