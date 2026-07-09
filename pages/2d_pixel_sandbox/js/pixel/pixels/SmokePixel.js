import { GasExpansionHelper } from '../helpers/GasExpansionHelper.js';
import { MATERIAL, Pixel } from '../Pixel.js';

export class SmokePixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.SMOKE,
      name: 'smoke',
      color: [82, 89, 86],
      weight: 10,
      buoyancy: 6,
      gas: true,
      gasSpread: 1,
      displaceable: true,
      plantGrowThrough: true,
    });
  }

  getInitialData(value = 0) {
    return value || 24 + Math.floor(Math.random() * 34);
  }

  renderColor(tone, life) {
    const wobble = (tone % 23) - 11;
    const fade = Math.max(0, Math.min(1, life / 56));
    const value = 35 + Math.floor(58 * fade) + Math.floor(wobble * 0.5);
    return [value, value + 4, value + 2];
  }

  update(world, i, x, y) {
    world.data[i] = Math.max(0, world.data[i] - 1);
    if (world.data[i] <= 0 || Math.random() < 0.01) {
      world.setCell(i, MATERIAL.SPACE);
      world.touched[i] = world.tick;
      return;
    }

    const dir = Math.random() < 0.5 ? -1 : 1;
    if (GasExpansionHelper.tryMoveIntoSpace(world, i, x, y, { upwardBias: 2 })) return;
    if (world.tryDisplaceInto(i, x, y - 1, -1)) return;
    if (Math.random() < 0.55 && world.tryDisplaceInto(i, x + dir, y - 1, -1)) return;
    if (Math.random() < 0.32) world.tryDisplaceInto(i, x + dir, y, -1);
    world.keepActive(i);
  }
}
