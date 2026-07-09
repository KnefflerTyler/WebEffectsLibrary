import { CombustionHelper } from '../helpers/CombustionHelper.js';
import { MATERIAL, Pixel } from '../Pixel.js';

export class FirePixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.FIRE,
      name: 'fire',
      color: [255, 112, 22],
      weight: 10,
      buoyancy: 2,
      displaceable: true,
      burns: true,
      scorchTo: MATERIAL.ASH,
    });
  }

  getInitialData(value = 0) {
    return value || 18 + Math.floor(Math.random() * 18);
  }

  renderColor(tone, life) {
    const hot = Math.min(1, life / 36);
    return [
      225 + Math.floor(30 * hot),
      62 + Math.floor(132 * hot) + (tone % 24),
      14 + Math.floor(28 * hot),
    ];
  }

  update(world, i, x, y) {
    if (world.hasNeighborWhere(x, y, (pixel) => pixel.extinguishPower > 0)) {
      if (world.isStatic(i)) {
        world.emitIntoNeighbor(x, y, MATERIAL.STEAM, 18, 0.78);
        world.keepActive(i);
      } else {
        world.setCell(i, MATERIAL.STEAM, 18);
      }
      world.touched[i] = world.tick;
      world.consumeExtinguishingNeighbors(x, y, 0.34);
      return;
    }

    if (!CombustionHelper.consumeOxygenNear(world, x, y, 0.62)) {
      world.setCell(i, Math.random() < 0.7 ? MATERIAL.SMOKE : MATERIAL.ASH, 12, { force: true, flags: 0 });
      world.touched[i] = world.tick;
      return;
    }

    if (world.isStatic(i)) {
      world.emitIntoNeighbor(x, y, MATERIAL.SMOKE, 18, 0.06);
      world.igniteFlammableNeighbors(x, y, 5.15);
      world.scorchLowFlammabilityNeighbors(x, y, 0.005);
      world.touched[i] = world.tick;
      world.keepActive(i);
      return;
    }

    world.data[i] = Math.max(0, world.data[i] - 1);
    world.igniteFlammableNeighbors(x, y, 5.15);
    world.scorchLowFlammabilityNeighbors(x, y, 0.005);

    if (world.data[i] <= 0 || Math.random() < 0.018) {
      world.setCell(i, Math.random() < 0.45 ? MATERIAL.SMOKE : MATERIAL.ASH, 16);
      world.touched[i] = world.tick;
      return;
    }

    if (Math.random() < 0.46 && world.tryDisplaceInto(i, x, y - 1, -1)) return;
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (Math.random() < 0.18) world.tryDisplaceInto(i, x + dir, y - 1, -1);
    world.keepActive(i);
  }
}
